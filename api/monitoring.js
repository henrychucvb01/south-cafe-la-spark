import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { PDFDocument } from "pdf-lib";
import { validate } from "../src/supperMonitoring/model.js";
import { canonicalReport, TEMPLATE_VERSION, TEMPLATE_SHA256 } from "../src/supperMonitoring/officialForm.js";
import { generateOfficialPdf } from "../src/supperMonitoring/pdf.js";

export function submissionErrors(payload) {
  let errors;
  try { errors = validate(payload); } catch { return [{ section: 0, message: "This draft has an unsupported format. Reopen it before submitting." }]; }
  const digest = createHash("sha256").update(canonicalReport(payload)).digest("hex");
  for (const role of ["monitor", "coordinator"]) {
    const signature = payload.signatures?.[role];
    if (signature?.contentHash !== digest) errors.push({ section: 7, message: `${role === "monitor" ? "Monitor" : "ASP Coordinator"}: accept a signature for the current report content.` });
    const valid = signature && Number.isFinite(Date.parse(signature.acceptedAt)) && Number.isFinite(signature.aspectRatio) && signature.aspectRatio > 0 && signature.aspectRatio <= 20 && Array.isArray(signature.strokes) && signature.strokes.length <= 80 && signature.strokes.every(stroke => Array.isArray(stroke) && stroke.length <= 1500 && stroke.every(point => Array.isArray(point) && point.length === 2 && point.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1)));
    if (!valid) errors.push({ section: 7, message: "A signature is incomplete or invalid. Clear it and sign again." });
  }
  return errors;
}

// Injectable dependencies keep server authorization, rendering and failures
// testable without live credentials. No client-supplied PDF or payload is trusted.
export function createHandler({ database, templateLoader = () => readFile(resolve(process.cwd(), "public/supper-monitoring-2022-09-08.pdf")) }) {
  return async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    if (request.method !== "POST") return response.status(405).json({ error: "Use POST." });
    const token = String(request.headers.authorization || "").replace(/^Bearer /, "");
    if (!/^[a-f0-9-]{72}$/.test(token)) return response.status(401).json({ error: "Re-enter your SPARK PIN to continue." });
    const { action, id, revision, metadata, pdfBase64, pdfs, version, annotations, comment, reviewAction } = request.body || {};
    if (!["preview", "submit", "download", "upload", "upload-preview", "review"].includes(action) || (!(["upload", "upload-preview"].includes(action) && !id) && !/^[a-f0-9-]{36}$/.test(id || ""))) return response.status(400).json({ error: "Choose a saved monitoring and a valid action." });
    async function rpc(name, params) { const { data, error } = await database.rpc(name, params); if (error) throw new Error(error.message); return data; }
    function pdfResponse(bytes) { response.setHeader("Content-Type", "application/pdf"); response.setHeader("Content-Disposition", `attachment; filename="Monitoring-${id}.pdf"`); return response.status(200).send(Buffer.from(bytes)); }
    try {
      if (action === "upload" || action === "upload-preview") {
        await rpc("supper_context", { p_token: token });
        // Accept the legacy one-PDF request as well as ordered one/two-file uploads.
        const inputs = pdfs === undefined ? [pdfBase64] : pdfs;
        if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 2) return response.status(422).json({error:"Select 1 or 2 PDFs."});
        if (inputs.some(value => typeof value !== "string" || value.length > 2800000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))) return response.status(422).json({error:"Select valid PDFs totaling no more than 2 MB."});
        const sources = inputs.map(value=>Buffer.from(value,"base64"));
        if (sources.reduce((size,bytes)=>size+bytes.length,0)>2097152 || sources.some(bytes=>bytes.length<100 || bytes.subarray(0,5).toString()!=="%PDF-")) return response.status(422).json({error:"Select valid PDFs totaling no more than 2 MB."});
        let bytes = sources[0];
        try {
          const documents = await Promise.all(sources.map(source=>PDFDocument.load(source)));
          if (documents.some(doc=>doc.isEncrypted || doc.getPageCount()<1) || documents.reduce((pages,doc)=>pages+doc.getPageCount(),0)>20) throw Error();
          if (documents.length===2) {
            const combined = await PDFDocument.create();
            for (const document of documents) {
              // Embed filled field appearances before copying pages so values remain visible.
              // Page content, images, dimensions and rotation are copied without rasterizing.
              if (document.getForm().getFields().length) document.getForm().flatten();
              for (const page of await combined.copyPages(document,document.getPageIndices())) combined.addPage(page);
            }
            bytes = Buffer.from(await combined.save());
          }
        } catch { return response.status(422).json({error:"Use readable, unencrypted PDFs with 1–20 combined pages."}); }
        if (bytes.length>2097152) return response.status(422).json({error:"The combined PDF exceeds 2 MB. Choose smaller PDFs."});
        if (action === "upload-preview") return pdfResponse(bytes);
        const saved = await rpc("upload_supper_pdf", {p_token:token,p_id:id || null,p_revision:revision || null,p_metadata:metadata,p_pdf_base64:bytes.toString("base64"),p_pdf_sha256:createHash("sha256").update(bytes).digest("hex")});
        return response.status(200).json({record:saved});
      }
      if (action === "review") {
        const context = await rpc("supper_context", { p_token: token });
        if (context.actor_role !== "supervisor") return response.status(403).json({error:"Supervisor authorization required."});
        if (!Number.isInteger(version) || version < 1 || !Number.isInteger(revision)) return response.status(400).json({error:"Choose the current saved PDF and record revision."});
        const encoded = await rpc("read_supper_monitoring_pdf", {p_token:token,p_id:id});
        const pdf = await PDFDocument.load(Buffer.from(encoded,"base64"));
        const record = await rpc("save_supper_pdf_review", {p_token:token,p_id:id,p_revision:revision,p_document_version:version,p_page_count:pdf.getPageCount(),p_annotations:annotations,p_comment:comment || "",p_action:reviewAction || "save"});
        return response.status(200).json({record});
      }
      // This function checks the opaque session, expiry, active school and assignment.
      const record = await rpc("get_supper_monitoring", { p_token: token, p_id: id });
      if (action === "download") {
        const encoded = await rpc("read_supper_monitoring_pdf", { p_token: token, p_id: id });
        return pdfResponse(Buffer.from(encoded,"base64"));
      }
      if (["submitted","accepted","completed"].includes(record.status)) {
        if (action === "submit") return response.status(200).json({ record }); // Safe retry after an interrupted response.
        const encoded = await rpc("read_supper_monitoring_pdf", { p_token: token, p_id: id });
        return pdfResponse(Buffer.from(encoded, "base64"));
      }
      if (!Number.isInteger(revision) || record.revision !== revision) return response.status(409).json({ error: "The draft changed in another session. Reopen the saved draft before submitting." });
      if (record.source === "uploaded" || record.status === "deleted") return response.status(409).json({error:"Use the uploaded PDF review workflow for this record."});
      if (record.monitoring_type && record.monitoring_type !== "supper") return response.status(409).json({error:"This guided monitoring type is not available yet."});
      const errors = submissionErrors(record.payload);
      if (errors.length) return response.status(422).json({ error: "Complete the items in Final Review before submitting.", errors });
      const { data: school, error: schoolError } = await database.from("locations").select("school_name,location_code").eq("id", record.location_id).single();
      if (schoolError || !school) throw new Error("The authorized school could not be loaded.");
      const template = await templateLoader();
      if (createHash("sha256").update(template).digest("hex") !== TEMPLATE_SHA256) throw new Error("The official PDF template does not match the verified version.");
      const bytes = await generateOfficialPdf(template, record.payload, {...school, monitoring_site_name: record.monitoring_site_name || "Main Site"}, { monitorRole: record.monitor_role || "manager" });
      if (action === "preview") return pdfResponse(bytes);
      const hash = createHash("sha256").update(bytes).digest("hex");
      const completed = await rpc("finalize_supper_monitoring", { p_token: token, p_id: id, p_revision: revision, p_template_version: TEMPLATE_VERSION, p_pdf_base64: Buffer.from(bytes).toString("base64"), p_pdf_sha256: hash });
      return response.status(200).json({ record: completed });
    } catch (error) {
      const status = error.section !== undefined ? 422 : /Session expired|access|assigned|not found for this school|authorization|Only the creator/i.test(error.message) ? 403 : /changed|revision/i.test(error.message) ? 409 : 500;
      return response.status(status).json({ error: error.message || "The report could not be saved. Your draft is preserved.", ...(error.section !== undefined ? { errors: [{ section: error.section, message: error.message }] } : {}) });
    }
  };
}
export default async function handler(request, response) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) { response.setHeader("Cache-Control", "no-store"); return response.status(503).json({ error: "Report submission is not configured yet. Your draft is preserved; contact your SPARK administrator." }); }
  const database = createClient(process.env.SUPABASE_URL || "https://kkrcxqhfzepifhkryodd.supabase.co", key, { auth: { persistSession: false, autoRefreshToken: false } });
  return createHandler({ database })(request, response);
}
