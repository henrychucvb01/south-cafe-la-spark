import React, { useState } from "react";

const INCIDENT_HELP = [
  {
    type: "Rude and Discourteous Behavior",
    summary:
      "Use for behavior such as yelling, arguing, combative behavior, disrespectful conduct, or similar treatment of employees, students, or the public.",
  },
  {
    type: "Insubordination",
    summary:
      "Use when an employee refuses or willfully fails to follow a directive from a higher-ranking staff member.",
  },
  {
    type: "Dereliction of Duties",
    summary:
      "Use when an employee fails to perform an assigned duty or responsibility.",
  },
  {
    type: "Fight",
    summary:
      "Use for a physical confrontation or fight involving employees or others.",
  },
  {
    type: "Theft",
    summary:
      "Use when there is a concern involving unauthorized taking of property, food, supplies, money, or other items.",
  },
  {
    type: "Drug or Alcohol Use",
    summary:
      "Use for workplace concerns involving alcohol or drugs.",
  },
  {
    type: "Attendance",
    summary:
      "Use for tardiness, absences, call-in procedures, attendance documentation, or related attendance concerns.",
  },
  {
    type: "Safety / Sanitation",
    summary:
      "Use for unsafe practices, sanitation problems, food-handling concerns, handwashing, PPE, or other health and safety issues.",
  },
  {
    type: "Temperature Logs",
    summary:
      "Use when required food temperature checks or temperature-log documentation were not completed correctly.",
  },
  {
    type: "Dress / Personal Hygiene",
    summary:
      "Use for concerns involving work clothing, nails, hair restraints, personal cleanliness, or related hygiene requirements.",
  },
  {
    type: "Workers' Compensation",
    summary:
      "Use for work-related injury reporting, required follow-up, medical documentation, or workers' compensation responsibilities.",
  },
  {
    type: "Cell Phone / Electronics",
    summary:
      "Use for personal cell phone, earbud, tablet, or other personal electronic-device use during assigned work time.",
  },
  {
    type: "Other",
    summary:
      "Use when the incident does not reasonably fit one of the listed categories.",
  },
];

export default function IncidentTypeHelp({
  onSelectType,
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="incident-help-button"
        title="Get help choosing an incident type"
        aria-label="Get help choosing an incident type"
        onClick={() => setOpen(true)}
      >
        ?
      </button>

      {open && (
        <div
          className="incident-help-overlay"
          onClick={() => setOpen(false)}
        >
          <div
            className="incident-help-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div className="incident-help-header">
              <div>
                <span className="eyebrow">
                  INCIDENT TYPE GUIDE
                </span>

                <h2>
                  Which incident type should I use?
                </h2>

                <p>
                  Review the descriptions below and choose the
                  category that most closely matches what
                  occurred.
                </p>
              </div>

              <button
                type="button"
                className="incident-help-close"
                onClick={() => setOpen(false)}
                aria-label="Close incident type help"
              >
                ×
              </button>
            </div>

            <div className="incident-help-notice">
              <strong>
                This guide helps with documentation only.
              </strong>{" "}
              It does not determine discipline or replace
              supervisor or HR guidance.
            </div>

            <div className="incident-help-list">
              {INCIDENT_HELP.map((item) => (
                <div
                  className="incident-help-item"
                  key={item.type}
                >
                  <div>
                    <h3>{item.type}</h3>
                    <p>{item.summary}</p>
                  </div>

                  <button
                    type="button"
                    className="incident-help-select"
                    onClick={() => {
                      onSelectType(item.type);
                      setOpen(false);
                    }}
                  >
                    Use this category
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}