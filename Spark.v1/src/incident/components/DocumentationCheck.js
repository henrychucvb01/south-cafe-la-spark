import React from "react";

function DocumentationCheck({
  result,
  onEditField,
  onContinue,
}) {
  if (!result) return null;

  const { issues, canContinue } = result;

  return (
    <section className="documentation-check">
      <div className="check-header">
        <div>
          <span className="check-eyebrow">
            DOCUMENTATION CHECK
          </span>

          <h2>
            Let's make sure the incident is documented clearly.
          </h2>

          <p>
            The helper reviews the information for missing
            details, vague wording, and useful follow-up
            questions.
          </p>
        </div>
      </div>

      {issues.length === 0 ? (
        <div className="check-success">
          <strong>Looks good.</strong>

          <p>
            The incident includes the key information needed
            for the next step.
          </p>
        </div>
      ) : (
        <div className="check-list">
          {issues.map((issue) => (
            <div
              key={issue.id}
              className={`check-item ${issue.level}`}
            >
              <div className="check-icon">
                {issue.level === "error" && "!"}
                {issue.level === "warning" && "⚠"}
                {issue.level === "info" && "i"}
              </div>

              <div className="check-content">
                <div className="check-title">
                  {issue.title}
                </div>

                <p>{issue.message}</p>

                {issue.followUpQuestion && (
                  <div className="follow-up">
                    <strong>Helpful question:</strong>

                    <span>
                      {issue.followUpQuestion}
                    </span>
                  </div>
                )}

                {issue.field && onEditField && (
                  <button
                    type="button"
                    className="check-edit-button"
                    onClick={() =>
                      onEditField(issue.field)
                    }
                  >
                    Review this answer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="check-footer">
        {!canContinue && (
          <p className="check-block-message">
            Complete the items marked as required before
            creating the Incident Record.
          </p>
        )}

        <button
          type="button"
          className="primary"
          disabled={!canContinue}
          onClick={onContinue}
        >
          Continue to Incident Record →
        </button>
      </div>
    </section>
  );
}

export default DocumentationCheck;