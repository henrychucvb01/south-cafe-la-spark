import React, { useEffect, useState } from "react";

import PdfMarkupViewer from "./PdfMarkupViewer";

import { previewReport } from "./service";



export default function FinalPdfReview({ token, record, onReady, onIssues }) {

  const [bytes, setBytes] = useState(null);

  const [error, setError] = useState("");

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {

    let cancelled = false;

    setBytes(null); setError(""); onReady(false);

    previewReport(token, record).then(value => { if (!cancelled) setBytes(value); })

      .catch(e => { if (!cancelled) { setError(e.message); onIssues(e.errors || []); } });

    return () => { cancelled = true; };

  // The saved revision is the identity of this preview. Never reuse an older PDF.


  }, [token, record, attempt, onReady, onIssues]);

  return <section aria-label="Official PDF final review"><h3>Review the official PDF</h3><p>Review both pages before submitting. This report uses your current saved information.</p>{error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(n => n + 1)}>Retry PDF Review</button></div> : bytes ? <PdfMarkupViewer bytes={bytes} annotations={[]} onReady={onReady} /> : <p role="status">Preparing your official PDF…</p>}</section>;

}

