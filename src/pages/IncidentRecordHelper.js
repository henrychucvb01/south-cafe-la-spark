import React, { useEffect, useState } from "react";

import DocumentationCheck from "../incident/components/DocumentationCheck";
import { checkIncidentDocumentation } from "../incident/utils/documentationChecker";
import { generateIncidentPdf } from "../incident/utils/pdfGenerator";
import { analyzeIncident } from "../incident/services/incidentAi";
import IncidentTypeHelp from "../incident/components/IncidentTypeHelp";
import {
  buildSparkGuidance,
  getReferenceAttentionLevel,
} from "../incident/reference/incidentGuidance";

const INCIDENT_TYPES = [
  "Rude and Discourteous Behavior",
  "Insubordination",
  "Dereliction of Duties",
  "Fight",
  "Theft",
  "Drug or Alcohol Use",
  "Attendance",
  "Safety / Sanitation",
  "Temperature Logs",
  "Dress / Personal Hygiene",
  "Workers' Compensation",
  "Cell Phone / Electronics",
  "Other",
];

const PRIOR_ACTIONS = [
  "None",
  "Unknown",
  "Verbal Warning",
  "Conference Memo",
  "Letter of Reprimand",
  "NOUS",
];

const emptyForm = {
  roughDescription: "",
  employeeName: "",
  employeeNumber: "",
  classification: "",
  employeeStartDate: "",
  schoolName: "",
  cafeteriaPhone: "",
  managerName: "",
  areaSupervisor: "",
  priorAction: "None",
  priorActionDates: "",
  incidentType: "",
  incidentDate: "",
  incidentTime: "",
  incidentWhere: "",
  involvedPeople: "",
  observedFacts: "",
  exactWords: "",
  managerAction: "",
  employeeResponse: "",
  impact: "",
  witnesses: "",
  assistanceGuidance: "",
  writtenStatement: "Unknown",
  missingInformation: [],
  followUpQuestions: [],
  narrative: "",
};

function formatDate(value) {
  if (!value) return "";

  if (value.includes("/")) {
    return value;
  }

  const parts = value.split("-");

  if (parts.length !== 3) {
    return value;
  }

  return `${parts[1]}/${parts[2]}/${parts[0]}`;
}

function buildNarrative(form) {
  const paragraphs = [];

  let opening = "";

  if (form.incidentDate) {
    opening += `On ${formatDate(form.incidentDate)}`;
  }

  if (form.incidentTime) {
    opening += `${opening ? ", " : ""}at approximately ${form.incidentTime}`;
  }

  if (form.incidentWhere) {
    opening += `${opening ? ", " : ""}in ${form.incidentWhere}`;
  }

  if (opening) {
    opening += ", ";
  }

  opening += form.employeeName
    ? `${form.employeeName} was involved in the following incident.`
    : "The following incident occurred.";

  paragraphs.push(opening);

  if (form.observedFacts.trim()) {
    paragraphs.push(form.observedFacts.trim());
  }

  if (form.exactWords.trim()) {
    paragraphs.push(
      `During the incident, the following statement was reported: "${form.exactWords.trim()}"`
    );
  }

  if (form.managerAction.trim()) {
    paragraphs.push(`Manager action taken: ${form.managerAction.trim()}`);
  }

  if (form.employeeResponse.trim()) {
    paragraphs.push(`Employee response: ${form.employeeResponse.trim()}`);
  }

  if (form.impact.trim()) {
    paragraphs.push(
      `Impact on operations or the workplace: ${form.impact.trim()}`
    );
  }

  return paragraphs.join("\n\n");
}

function IncidentRecordHelper({ location, employee, onBack }) {
  const [step, setStep] = useState(1);

  const [form, setForm] = useState(() => ({
    ...emptyForm,
    schoolName: location?.school_name || "",
    managerName: employee?.employee_name || "",
  }));

  const [documentationResult, setDocumentationResult] = useState(null);

  const [confirmed, setConfirmed] = useState(false);

  const [reviewedFields, setReviewedFields] = useState({});

  const [analyzing, setAnalyzing] = useState(false);
  const [recordGenerated, setRecordGenerated] = useState(false);

  const [aiReview, setAiReview] = useState({
    attentionLevel: "",
    attentionReason: "",
    writingCoach: [],
    professionalSummary: "",
  });
  // ---------------------------------------------------
  // PREFILL SPARK INFORMATION
  // ---------------------------------------------------

  useEffect(() => {
    setForm((current) => ({
      ...current,

      schoolName: current.schoolName || location?.school_name || "",

      managerName: current.managerName || employee?.employee_name || "",
    }));
  }, [location, employee]);

// ---------------------------------------------------
// FORM HELPERS
// ---------------------------------------------------

const update = (field, value) => {
  setForm((current) => ({
    ...current,
    [field]: value,
  }));

  setReviewedFields((current) => ({
    ...current,
    [field]: true,
  }));

  setConfirmed(false);
};

const markReviewed = (field) => {
  setReviewedFields((current) => ({
    ...current,
    [field]: true,
  }));
};

const goToStep = (number) => {
  setStep(number);

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
};

function resetIncidentRecord() {
  setStep(1);

  setForm({
    ...emptyForm,
    schoolName: location?.school_name || "",
    managerName: employee?.employee_name || "",
  });

  setDocumentationResult(null);
  setConfirmed(false);
  setReviewedFields({});
  setRecordGenerated(false);
  setAiReview({
    attentionLevel: "",
    attentionReason: "",
    writingCoach: [],
    professionalSummary: "",
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}
   

  // ---------------------------------------------------
  // INCIDENT ANALYSIS
  // ---------------------------------------------------

  // ---------------------------------------------------
  // INCIDENT ANALYSIS
  // ---------------------------------------------------

  const analyzeDescription = async () => {
    if (!form.roughDescription.trim()) {
      alert("Please describe what happened first.");

      return;
    }

    try {
      setAnalyzing(true);

      const extracted = await analyzeIncident(form.roughDescription);

      setReviewedFields({
        schoolName: true,
        managerName: true,
      });

      setForm((current) => ({
        ...current,

        // Preserve SPARK information
        schoolName: current.schoolName || location?.school_name || "",

        managerName: current.managerName || employee?.employee_name || "",

        employeeName: extracted.employeeName || current.employeeName || "",

        incidentType: extracted.incidentType || "",

        incidentDate: extracted.incidentDate || "",

        incidentTime: extracted.incidentTime || "",

        incidentWhere: extracted.incidentWhere || "",

        involvedPeople: extracted.involvedPeople || "",

        observedFacts: extracted.observedFacts || "",

        exactWords: extracted.exactWords || "",

        managerAction: extracted.managerAction || "",

        employeeResponse: extracted.employeeResponse || "",

        witnesses: extracted.witnesses || "",

        impact: extracted.impact || "",

        assistanceGuidance: extracted.assistanceGuidance || "",

        missingInformation: extracted.missingInformation || [],

        followUpQuestions: extracted.followUpQuestions || [],
      }));

      setAiReview({
        attentionLevel: extracted.attentionLevel || "moderate",
        attentionReason: extracted.attentionReason || "",
        writingCoach: Array.isArray(extracted.writingCoach)
          ? extracted.writingCoach
          : [],
        professionalSummary: extracted.professionalSummary || "",
      });

      goToStep(2);
    } catch (error) {
      console.error("Incident analysis failed:", error);

      alert(
        error.message ||
          "The incident could not be organized. Please try again."
      );
    } finally {
      setAnalyzing(false);
    }
  };

  // ---------------------------------------------------
  // DOCUMENTATION CHECK
  // ---------------------------------------------------

  const runDocumentationCheck = () => {
    const result = checkIncidentDocumentation(form);

    setDocumentationResult(result);

    goToStep(3);
  };

  const continueFromCheck = () => {
    setForm((current) => ({
      ...current,
      narrative: buildNarrative(current),
    }));

    goToStep(4);
  };

  const editField = (field) => {
    goToStep(2);

    setTimeout(() => {
      const element = document.querySelector(`[data-field="${field}"]`);

      if (element) {
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }, 200);
  };

  // ---------------------------------------------------
  // SPARK REFERENCE GUIDANCE
  // ---------------------------------------------------

  const sparkGuidance = buildSparkGuidance({
    incidentType: form.incidentType,
    roughDescription: form.roughDescription,
    observedFacts: form.observedFacts,
  });

  const referenceAttention = getReferenceAttentionLevel({
    incidentType: form.incidentType,
    roughDescription: form.roughDescription,
    observedFacts: form.observedFacts,
    impact: form.impact,
  });

  const applyAssistanceSuggestion = (suggestion) => {
    if (!suggestion) return;

    setForm((current) => ({
      ...current,
      assistanceGuidance: current.assistanceGuidance?.trim()
        ? `${current.assistanceGuidance.trim()}\n${suggestion}`
        : suggestion,
    }));

    setReviewedFields((current) => ({
      ...current,
      assistanceGuidance: true,
    }));

    setConfirmed(false);
  };

  // ---------------------------------------------------
  // RENDER
  // ---------------------------------------------------

  return (
    <div className="incident-helper-page">
      {/* =============================================
          SPARK HEADER
      ============================================= */}

      <header className="login-header incident-helper-header no-print">
        <div className="login-brand">
          <div className="login-logo spark-login-logo">
            <img src="/spark-192.png" alt="Spark" />
          </div>

          <div>
            <div className="login-brand-name">SOUTH CAFÉ LA</div>

            <div className="login-brand-subtitle">SPARK</div>
          </div>
        </div>

        <button type="button" className="homebase-exit-button" onClick={onBack}>
          ← Back to Home Base
        </button>
      </header>

      <main className="incident-container">
        {/* =============================================
            INTRO
        ============================================= */}

        <section className="incident-intro no-print">
          <div className="incident-tool-label">MANAGER DOCUMENTATION TOOL</div>

          <h1>Incident Record Helper</h1>

          <p>
            Tell SPARK what happened in your own words. Your information will be
            organized for you to review before the Incident Record is created.
          </p>

          <div className="incident-location-summary">
            <div>
              <span>School</span>

              <strong>{location?.school_name || "School"}</strong>
            </div>

            <div>
              <span>Manager</span>

              <strong>{employee?.employee_name || "Manager"}</strong>
            </div>
          </div>

          <div className="incident-notice">
            <strong>Don't worry about grammar or formal wording.</strong>

            <span>
              Just explain what happened as clearly as you can. You will review
              everything before the Incident Record is created.
            </span>
          </div>
        </section>

        <Progress step={step} />

        {/* =============================================
            STEP 1 — DESCRIBE
        ============================================= */}

        {step === 1 && (
          <section className="incident-card no-print">
            <SectionHeader
              number="1"
              title="Tell Me What Happened"
              text="Write the incident the way you would explain it to your supervisor."
            />

            <div className="story-helper">
              <strong>Just tell the story.</strong>

              <p>
                Include whatever you remember: who was involved, what happened,
                when and where it happened, what was said, what you did, and how
                the employee responded.
              </p>

              <p>
                If you do not know a detail, don't guess. Leave it out and
                review it on the next screen.
              </p>
            </div>

            <textarea
              className="story-box"
              rows={15}
              value={form.roughDescription}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  roughDescription: event.target.value,
                }))
              }
              placeholder={`Example:

Yesterday around 10:30 during lunch preparation, Maria Lopez started yelling at John Smith near the serving line because she said he wasn't helping. Maria said, "You never do anything around here." I told Maria to stop yelling and return to her assigned duties. She continued arguing for about one minute and then returned to the serving line. Sonia Hernandez was standing nearby and heard the conversation.`}
            />

            <div className="story-tip">
              <strong>Tip:</strong> If you remember someone's exact words, put
              them in quotation marks.
            </div>

            <div className="incident-nav">
              <button
                type="button"
                className="incident-primary"
                onClick={analyzeDescription}
                disabled={analyzing}
              >
                {analyzing ? (
                  <>
                    <span className="spark-thinking-spinner"></span>
                    SPARK is thinking...
                  </>
                ) : (
                  <>✦ Organize Incident</>
                )}
              </button>
            </div>
          </section>
        )}

        {/* =============================================
            STEP 2 — REVIEW
        ============================================= */}

        {step === 2 && (
          <section className="incident-card no-print">
            <SectionHeader
              number="2"
              title="Review the Incident Details"
              text="SPARK organized what you wrote. Review and correct anything before continuing."
            />

            <div className="review-alert">
              <strong>You are still in control.</strong>

              <p>
                Review every section below. Fields that still need review will
                be highlighted. Once you change or confirm a field, it will be
                marked reviewed.
              </p>
            </div>
            <SparkAiReview
              form={form}
              aiReview={aiReview}
              sparkGuidance={sparkGuidance}
              referenceAttention={referenceAttention}
            />

            {/* EMPLOYEE INFORMATION */}

            <div className="review-section-title">
              <h3>Employee Information</h3>

              <p>Complete any information that was not provided.</p>
            </div>

            <div className="grid three">
              <ReviewField
                label="Employee Name"
                dataField="employeeName"
                reviewed={reviewedFields.employeeName}
                onReviewed={markReviewed}
              >
                <input
                  type="text"
                  value={form.employeeName}
                  onChange={(event) =>
                    update("employeeName", event.target.value)
                  }
                  placeholder="Enter employee name"
                />
              </ReviewField>

              <ReviewField
                label="Employee Number"
                dataField="employeeNumber"
                reviewed={reviewedFields.employeeNumber}
                onReviewed={markReviewed}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={form.employeeNumber}
                  onChange={(event) =>
                    update(
                      "employeeNumber",
                      event.target.value.replace(/\D/g, "")
                    )
                  }
                  placeholder="Enter employee number"
                />
              </ReviewField>

              <ReviewField
                label="Classification"
                dataField="classification"
                reviewed={reviewedFields.classification}
                onReviewed={markReviewed}
              >
                <select
                  value={form.classification}
                  onChange={(event) =>
                    update("classification", event.target.value)
                  }
                >
                  <option value="">Select classification...</option>

                  <option value="4391">4391 - Food Service Worker</option>

                  <option value="4388">
                    4388 - Food Service Worker II (Driving)
                  </option>

                  <option value="4395">
                    4395 - Senior Food Service Worker
                  </option>

                  <option value="4291">4291 - Food Service Manager I</option>

                  <option value="4292">4292 - Food Service Manager II</option>

                  <option value="4293">4293 - Food Service Manager III</option>

                  <option value="4296">4296 - Food Service Manager IV</option>

                  <option value="4297">4297 - Food Service Manager V</option>

                  <option value="4294">4294 - Food Service Manager VI</option>
                </select>
              </ReviewField>
            </div>

            <div className="grid two">
              <ReviewField
                label="Employee Start Date"
                dataField="employeeStartDate"
                reviewed={reviewedFields.employeeStartDate}
                onReviewed={markReviewed}
              >
                <input
                  type="date"
                  value={form.employeeStartDate}
                  onChange={(event) =>
                    update("employeeStartDate", event.target.value)
                  }
                />
              </ReviewField>

              <ReviewField
                label="School Name"
                dataField="schoolName"
                reviewed={reviewedFields.schoolName}
                onReviewed={markReviewed}
              >
                <input
                  type="text"
                  value={form.schoolName}
                  onChange={(event) => update("schoolName", event.target.value)}
                  placeholder="Enter school name"
                />
              </ReviewField>

              <ReviewField
                label="Cafeteria Phone"
                dataField="cafeteriaPhone"
                reviewed={reviewedFields.cafeteriaPhone}
                onReviewed={markReviewed}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={form.cafeteriaPhone}
                  onChange={(event) =>
                    update(
                      "cafeteriaPhone",
                      event.target.value.replace(/\D/g, "")
                    )
                  }
                  placeholder="Enter cafeteria phone number"
                />
              </ReviewField>

              <ReviewField
                label="Cafeteria Manager"
                dataField="managerName"
                reviewed={reviewedFields.managerName}
                onReviewed={markReviewed}
              >
                <input
                  type="text"
                  value={form.managerName}
                  onChange={(event) =>
                    update("managerName", event.target.value)
                  }
                  placeholder="Enter manager name"
                />
              </ReviewField>

              <ReviewField
                label="Area Supervisor"
                dataField="areaSupervisor"
                reviewed={reviewedFields.areaSupervisor}
                onReviewed={markReviewed}
              >
                <input
                  type="text"
                  value={form.areaSupervisor}
                  onChange={(event) =>
                    update("areaSupervisor", event.target.value)
                  }
                  placeholder="Enter area supervisor"
                />
              </ReviewField>
            </div>

            <div className="divider" />

            {/* PREVIOUS DOCUMENTATION */}

            <div className="review-section-title">
              <h3>Previous Documentation</h3>
            </div>

            <ReviewField
              label="Previous Corrective or Disciplinary Documentation"
              dataField="priorAction"
              reviewed={reviewedFields.priorAction}
              onReviewed={markReviewed}
            >
              <select
                value={form.priorAction}
                onChange={(event) => update("priorAction", event.target.value)}
              >
                {PRIOR_ACTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </ReviewField>

            {!["None", "Unknown"].includes(form.priorAction) && (
              <ReviewField
                label="Date(s) of Previous Documentation"
                dataField="priorActionDates"
                reviewed={reviewedFields.priorActionDates}
                onReviewed={markReviewed}
              >
                <input
                  type="text"
                  value={form.priorActionDates}
                  onChange={(event) =>
                    update("priorActionDates", event.target.value)
                  }
                  placeholder="Example: 04/12/2026"
                />
              </ReviewField>
            )}

            <div className="divider" />

            {/* INCIDENT INFORMATION */}

            <div className="review-section-title">
              <h3>Incident Information</h3>
            </div>

            <ReviewField
              label={
                <span className="incident-type-title-row">
                  Incident Type
                  <IncidentTypeHelp
                    onSelectType={(type) => update("incidentType", type)}
                  />
                </span>
              }
              dataField="incidentType"
              reviewed={reviewedFields.incidentType}
              onReviewed={markReviewed}
            >
              <select
                value={form.incidentType}
                onChange={(event) => update("incidentType", event.target.value)}
              >
                <option value="">Select...</option>

                {INCIDENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </ReviewField>

            <div className="grid two">
              <ReviewField
                label="When — Date"
                dataField="incidentDate"
                reviewed={reviewedFields.incidentDate}
                onReviewed={markReviewed}
              >
                <input
                  type="date"
                  value={form.incidentDate}
                  onChange={(event) =>
                    update("incidentDate", event.target.value)
                  }
                />
              </ReviewField>

              <ReviewField
                label="When — Approximate Time"
                dataField="incidentTime"
                reviewed={reviewedFields.incidentTime}
                onReviewed={markReviewed}
              >
                <input
                  type="time"
                  value={form.incidentTime}
                  onChange={(event) =>
                    update("incidentTime", event.target.value)
                  }
                />
              </ReviewField>
            </div>

            <ReviewField
              label="Where"
              dataField="incidentWhere"
              reviewed={reviewedFields.incidentWhere}
              onReviewed={markReviewed}
            >
              <input
                type="text"
                value={form.incidentWhere}
                onChange={(event) =>
                  update("incidentWhere", event.target.value)
                }
                placeholder="Not provided"
              />
            </ReviewField>

            <ReviewField
              label="Who Was Involved?"
              dataField="involvedPeople"
              reviewed={reviewedFields.involvedPeople}
              onReviewed={markReviewed}
            >
              <textarea
                rows={3}
                value={form.involvedPeople}
                onChange={(event) =>
                  update("involvedPeople", event.target.value)
                }
                placeholder="Not provided"
              />
            </ReviewField>

            <ReviewField
              label="What Happened?"
              dataField="observedFacts"
              reviewed={reviewedFields.observedFacts}
              onReviewed={markReviewed}
            >
              <textarea
                rows={7}
                value={form.observedFacts}
                onChange={(event) =>
                  update("observedFacts", event.target.value)
                }
                placeholder="Not provided"
              />
            </ReviewField>

            <ReviewField
              label="Exact Words or Statements"
              dataField="exactWords"
              reviewed={reviewedFields.exactWords}
              onReviewed={markReviewed}
            >
              <textarea
                rows={3}
                value={form.exactWords}
                onChange={(event) => update("exactWords", event.target.value)}
                placeholder="Not provided"
              />
            </ReviewField>

            <ReviewField
              label="Manager Action"
              dataField="managerAction"
              reviewed={reviewedFields.managerAction}
              onReviewed={markReviewed}
            >
              <textarea
                rows={4}
                value={form.managerAction}
                onChange={(event) =>
                  update("managerAction", event.target.value)
                }
                placeholder="Not provided"
              />
            </ReviewField>

            <ReviewField
              label="Employee Response"
              dataField="employeeResponse"
              reviewed={reviewedFields.employeeResponse}
              onReviewed={markReviewed}
            >
              <textarea
                rows={4}
                value={form.employeeResponse}
                onChange={(event) =>
                  update("employeeResponse", event.target.value)
                }
                placeholder="Not provided"
              />
            </ReviewField>

            <ReviewField
              label="Witnesses"
              dataField="witnesses"
              reviewed={reviewedFields.witnesses}
              onReviewed={markReviewed}
            >
              <textarea
                rows={3}
                value={form.witnesses}
                onChange={(event) => update("witnesses", event.target.value)}
                placeholder="Enter witness name(s), if any"
              />

              <button
                type="button"
                className="review-na-button"
                onClick={(event) => {
                  event.stopPropagation();

                  update("witnesses", "N/A");
                }}
              >
                No Witnesses / N/A
              </button>
            </ReviewField>

            <ReviewField
              label="Impact on Service or Workplace"
              dataField="impact"
              reviewed={reviewedFields.impact}
              onReviewed={markReviewed}
            >
              <textarea
                rows={3}
                value={form.impact}
                onChange={(event) => update("impact", event.target.value)}
                placeholder="Not provided"
              />
            </ReviewField>

            <ReviewField
              label="Assistance and Guidance Offered"
              dataField="assistanceGuidance"
              reviewed={reviewedFields.assistanceGuidance}
              onReviewed={markReviewed}
            >
              <textarea
                rows={4}
                value={form.assistanceGuidance}
                onChange={(event) =>
                  update("assistanceGuidance", event.target.value)
                }
                placeholder="Coaching, instructions, retraining, or assistance provided."
              />
            </ReviewField>

            <div className="spark-ai-panel spark-ai-summary">
              <div className="spark-ai-panel-title">
                <span>✓</span>
                <strong>Opportunity to Improve</strong>
              </div>

              <p>
                Assistance and guidance are important because the employee should
                understand the expectation and have an opportunity to improve.
                Only document coaching, retraining, clarification, or assistance
                that was actually provided.
              </p>

              {sparkGuidance?.assistanceGuidanceSuggestions?.length > 0 && (
                <>
                  <div className="spark-assistance-suggestions">
                    {sparkGuidance.assistanceGuidanceSuggestions
                      .slice(0, 5)
                      .map((suggestion, index) => (
                        <div
                          className="spark-assistance-suggestion"
                          key={`${suggestion}-${index}`}
                        >
                          <span>•</span>
                          <p>{suggestion}</p>
                        </div>
                      ))}
                  </div>

                  <div className="spark-assistance-actions">
                    {sparkGuidance.assistanceGuidanceSuggestions
                      .slice(0, 3)
                      .map((suggestion, index) => (
                        <button
                          key={`use-${index}`}
                          type="button"
                          className="incident-secondary"
                          onClick={() => applyAssistanceSuggestion(suggestion)}
                        >
                          Use suggestion {index + 1}
                        </button>
                      ))}
                  </div>
                </>
              )}

              <small>
                SPARK is offering coaching ideas, not confirming that the
                assistance occurred. Edit the field above so it accurately
                reflects what you actually did.
              </small>
            </div>

            <div className="incident-nav">
              <button
                type="button"
                className="incident-secondary"
                onClick={() => goToStep(1)}
              >
                ← Edit Original Description
              </button>

              <button
                type="button"
                className="incident-primary"
                onClick={runDocumentationCheck}
              >
                Check Documentation →
              </button>
            </div>
          </section>
        )}

        {/* =============================================
            STEP 3 — CHECK
        ============================================= */}

        {step === 3 && (
          <section className="incident-card no-print">
            <DocumentationCheck
              result={documentationResult}
              onEditField={editField}
              onContinue={continueFromCheck}
            />

            <div className="incident-nav">
              <button
                type="button"
                className="incident-secondary"
                onClick={() => goToStep(2)}
              >
                ← Back to Details
              </button>
            </div>
          </section>
        )}

        {/* =============================================
            STEP 4 — FINAL RECORD
        ============================================= */}

        {step === 4 && (
          <section className="incident-card no-print">
            <SectionHeader
              number="4"
              title="Final Incident Record"
              text="Review the final narrative before creating the official PDF."
            />

            <div className="incident-summary">
              <SummaryItem
                label="Employee"
                value={form.employeeName || "Not entered"}
              />

              <SummaryItem
                label="School"
                value={form.schoolName || "Not entered"}
              />

              <SummaryItem
                label="Incident Type"
                value={form.incidentType || "Not entered"}
              />

              <SummaryItem
                label="Incident Date"
                value={formatDate(form.incidentDate) || "Not entered"}
              />
            </div>

            <label className="field-label">Incident Narrative</label>

            <textarea
              className="narrative-editor"
              rows={15}
              value={form.narrative}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  narrative: event.target.value,
                }))
              }
            />

            <div className="accuracy">
              <label>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />

                <span>
                  I reviewed this Incident Record and confirm that the
                  information is accurate to the best of my knowledge.
                </span>
              </label>
            </div>

            <div className="incident-nav">
              <button
                type="button"
                className="incident-secondary"
                onClick={() => goToStep(2)}
              >
                ← Make Changes
              </button>

              {!recordGenerated ? (
                <button
                  type="button"
                  className="incident-primary"
                  disabled={!confirmed}
                  onClick={async () => {
                    const success = await generateIncidentPdf(form);

                    if (success) {
                      setRecordGenerated(true);
                    }
                  }}
                >
                  Generate Official Incident Record
                </button>
              ) : (
                <div className="incident-complete-actions">
                  <div className="incident-complete-message">
                    <strong>✓ Official Incident Record Generated</strong>

                    <span>
                      Your PDF has been created. Review it before printing or
                      submitting it.
                    </span>
                  </div>

                  <div className="incident-complete-buttons">
                    <button
                      type="button"
                      className="incident-secondary"
                      onClick={resetIncidentRecord}
                    >
                      Create Another Record
                    </button>

                    <button
                      type="button"
                      className="incident-primary"
                      onClick={onBack}
                    >
                      Back to Home Base
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}


// =====================================================
// SPARK AI REVIEW
// =====================================================

function formatReviewDate(value) {
  if (!value) return "Not provided";

  const date = new Date(`${value}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatReviewTime(value) {
  if (!value) return "Not provided";

  const match = String(value).match(/^(\d{2}):(\d{2})$/);

  if (!match) {
    return value;
  }

  const date = new Date();
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function SparkAiReview({
  form,
  aiReview,
  sparkGuidance,
  referenceAttention,
}) {
  const level = aiReview?.attentionLevel || "moderate";

  const levelLabels = {
    low: "Low",
    moderate: "Moderate",
    high: "High Attention",
  };

  const hasWritingCoach =
    Array.isArray(aiReview?.writingCoach) &&
    aiReview.writingCoach.length > 0;

  const hasQuestions =
    Array.isArray(form?.followUpQuestions) &&
    form.followUpQuestions.length > 0;

  return (
    <section className="spark-ai-review">
      <div className="spark-ai-review-header">
        <div className="spark-ai-review-mark">✦</div>

        <div>
          <div className="spark-ai-review-eyebrow">SPARK AI REVIEW</div>
          <h3>Here is what SPARK understood</h3>
          <p>
            Review SPARK's analysis, then verify or correct the detailed
            fields below.
          </p>
        </div>
      </div>

      <div className="spark-ai-understood-grid">
        <div className="spark-ai-understood-item">
          <span>Employee</span>
          <strong>{form.employeeName || "Not provided"}</strong>
        </div>

        <div className="spark-ai-understood-item">
          <span>Incident Type</span>
          <strong>{form.incidentType || "Not determined"}</strong>
        </div>

        <div className="spark-ai-understood-item">
          <span>Date / Time</span>
          <strong>
            {formatReviewDate(form.incidentDate)}
            {form.incidentTime
              ? ` · ${formatReviewTime(form.incidentTime)}`
              : ""}
          </strong>
        </div>

        <div className="spark-ai-understood-item">
          <span>Witness</span>
          <strong>{form.witnesses || "Not provided"}</strong>
        </div>
      </div>

      <div className={`spark-ai-attention ${level}`}>
        <div className="spark-ai-attention-top">
          <span>INCIDENT ATTENTION LEVEL</span>
          <strong>{levelLabels[level] || "Moderate"}</strong>
        </div>

        <p>
          {aiReview?.attentionReason ||
            "SPARK needs additional facts to explain this attention level."}
        </p>

        <small>
          This is a triage aid for supervisor review, not a disciplinary
          determination.
        </small>
      </div>

      {hasWritingCoach && (
        <div className="spark-ai-panel spark-ai-coach">
          <div className="spark-ai-panel-title">
            <span>✎</span>
            <strong>Documentation Coaching</strong>
          </div>

          <div className="spark-ai-coach-list">
            {aiReview.writingCoach.map((item, index) => (
              <div className="spark-ai-coach-item" key={index}>
                {item?.original && (
                  <div className="spark-ai-original">
                    “{item.original}”
                  </div>
                )}

                <p>{item?.coaching || item}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasQuestions && (
        <div className="spark-ai-panel spark-ai-questions">
          <div className="spark-ai-panel-title">
            <span>?</span>
            <strong>SPARK Needs Clarification</strong>
          </div>

          <p>
            These details may strengthen the record if the manager knows the
            answers. Do not guess.
          </p>

          <ul>
            {form.followUpQuestions.map((question, index) => (
              <li key={index}>{question}</li>
            ))}
          </ul>
        </div>
      )}

      {aiReview?.professionalSummary && (
        <div className="spark-ai-panel spark-ai-summary">
          <div className="spark-ai-panel-title">
            <span>✦</span>
            <strong>Suggested Professional Summary</strong>
          </div>

          <p>{aiReview.professionalSummary}</p>
        </div>
      )}

      {sparkGuidance && (
        <div className="spark-ai-panel spark-ai-reference">
          <div className="spark-ai-panel-title">
            <span>📖</span>
            <strong>Reference Guidance</strong>
          </div>

          <div className="spark-reference-match">
            <span>Possible reference match</span>
            <strong>{sparkGuidance.title}</strong>
            {sparkGuidance.pcRule && <small>{sparkGuidance.pcRule}</small>}
          </div>

          <p>{sparkGuidance.referenceSummary}</p>

          {sparkGuidance.managerFocus?.length > 0 && (
            <>
              <strong className="spark-reference-subtitle">
                What the manager should document
              </strong>

              <ul>
                {sparkGuidance.managerFocus.slice(0, 6).map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </>
          )}

          {sparkGuidance.severityNotes?.length > 0 && (
            <div className="spark-reference-caution">
              <strong>Reference note</strong>
              <ul>
                {sparkGuidance.severityNotes.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {sparkGuidance.hrFlag && (
            <p className="spark-reference-hr">
              <strong>Supervisor / HR guidance:</strong>{" "}
              {sparkGuidance.hrFlag}
            </p>
          )}

          <small>
            {sparkGuidance.disclaimer}
          </small>
        </div>
      )}

      {sparkGuidance?.languageCoaching?.length > 0 && (
        <div className="spark-ai-panel spark-ai-coach">
          <div className="spark-ai-panel-title">
            <span>✎</span>
            <strong>SPARK Language Coach</strong>
          </div>

          <p>
            SPARK found wording that may be stronger if it is replaced with
            observable facts.
          </p>

          <ul>
            {sparkGuidance.languageCoaching.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {referenceAttention && (
        <div className="spark-ai-reference-note">
          <span>⚑</span>
          <div>
            <strong>{referenceAttention.level}</strong>
            <p>
              {referenceAttention.label}. {referenceAttention.explanation}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

// =====================================================
// REVIEW FIELD
// =====================================================

function ReviewField({
  label,
  dataField,
  children,
  reviewed = false,
  onReviewed,
}) {
  const handleClick = (event) => {
    if (reviewed || !onReviewed) {
      return;
    }

    const target = event.target;

    const tagName = target.tagName;

    if (
      ["INPUT", "TEXTAREA", "SELECT"].includes(tagName) &&
      String(target.value || "").trim() !== ""
    ) {
      onReviewed(dataField);
    }
  };

  return (
    <div
      className={`review-field ${reviewed ? "reviewed" : ""}`}
      data-field={dataField}
      onClick={handleClick}
    >
      <div className="review-field-header">
        <strong>{label}</strong>

        <span>{reviewed ? "✓ Reviewed" : "Review"}</span>
      </div>

      {children}
    </div>
  );
}

// =====================================================
// PROGRESS
// =====================================================

function Progress({ step }) {
  const labels = ["Describe", "Review", "Check", "Record"];

  return (
    <div className="incident-progress no-print">
      {labels.map((label, index) => {
        const number = index + 1;

        return (
          <div
            key={label}
            className={`incident-progress-item ${
              step === number ? "active" : ""
            } ${step > number ? "complete" : ""}`}
          >
            <span>{step > number ? "✓" : number}</span>

            <small>{label}</small>
          </div>
        );
      })}
    </div>
  );
}

// =====================================================
// SECTION HEADER
// =====================================================

function SectionHeader({ number, title, text }) {
  return (
    <div className="incident-section-header">
      <div className="incident-section-number">{number}</div>

      <div>
        <h2>{title}</h2>

        <p>{text}</p>
      </div>
    </div>
  );
}

// =====================================================
// SUMMARY ITEM
// =====================================================

function SummaryItem({ label, value }) {
  return (
    <div className="incident-summary-item">
      <span>{label}</span>

      <strong>{value}</strong>
    </div>
  );
}

export default IncidentRecordHelper;
