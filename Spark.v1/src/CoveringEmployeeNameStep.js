import React, { useState } from "react";

// ============================================================
// COMPONENT
// ============================================================

function CoveringEmployeeNameStep({ location, onBack, onContinue }) {
  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState("");

  function cleanName(value) {
    return value.replace(/\s+/g, " ").trim();
  }

  function hasFirstAndLastName(value) {
    const parts = cleanName(value).split(" ").filter(Boolean);

    return parts.length >= 2;
  }

  function handleSubmit(e) {
    e.preventDefault();

    const name = cleanName(fullName);

    if (!name) {
      setMessage("Please enter your first and last name.");
      return;
    }

    if (!hasFirstAndLastName(name)) {
      setMessage("Please enter both your first and last name.");
      return;
    }

    const coveringEmployee = {
      id: null,
      employee_name: name,
      covering: true,
    };

    onContinue(coveringEmployee);
  }

  return (
    <div className="login-app">
      <header className="login-header">
        <div className="login-brand">
          <div className="login-logo">🍴</div>

          <div>
            <div className="login-brand-name">SOUTH CAFÉ LA</div>
            <div className="login-brand-subtitle">OPERATIONS</div>
          </div>
        </div>
      </header>

      <main className="login-main">
        <div className="login-card">
          <button
            type="button"
            className="finish-line-back"
            onClick={onBack}
            style={{
              marginBottom: "18px",
            }}
          >
            ← Back
          </button>

          <div
            style={{
              textAlign: "center",
              marginBottom: "22px",
            }}
          >
            <div
              style={{
                fontSize: "34px",
                marginBottom: "8px",
              }}
            >
              👤
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: "24px",
              }}
            >
              Covering This Location
            </h1>

            <p
              style={{
                margin: "8px 0 0",
                color: "#6d7883",
                fontSize: "13px",
              }}
            >
              {location?.school_name || "Selected Location"}
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <label
              htmlFor="coveringEmployeeName"
              style={{
                display: "block",
                fontSize: "11px",
                fontWeight: "800",
                marginBottom: "7px",
                color: "#34414d",
              }}
            >
              First and Last Name
            </label>

            <input
              id="coveringEmployeeName"
              type="text"
              autoFocus
              autoComplete="name"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value);
                setMessage("");
              }}
              placeholder="Example: Maria Lopez"
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: message ? "1px solid #d84a4a" : "1px solid #d6dfe7",
                borderRadius: "9px",
                padding: "13px 14px",
                fontSize: "15px",
                fontWeight: "600",
                outline: "none",
              }}
            />

            <div
              style={{
                marginTop: "8px",
                color: "#75818c",
                fontSize: "11px",
                lineHeight: "1.5",
              }}
            >
              Enter your name so your Finish Line work and any later corrections
              can be identified.
            </div>

            {message && (
              <div
                style={{
                  marginTop: "10px",
                  background: "#fff0f0",
                  border: "1px solid #efc3c3",
                  color: "#a12f2f",
                  borderRadius: "8px",
                  padding: "10px 12px",
                  fontSize: "11px",
                  fontWeight: "700",
                }}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              className="login-button"
              disabled={!fullName.trim()}
              style={{
                width: "100%",
                marginTop: "18px",
                padding: "13px",
                borderRadius: "9px",
                cursor: fullName.trim() ? "pointer" : "not-allowed",
                opacity: fullName.trim() ? 1 : 0.55,
              }}
            >
              Continue →
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default CoveringEmployeeNameStep;
