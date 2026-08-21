import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

function EmployeeSelectPage({ location, onEmployeeSelected, onBack }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCoveringForm, setShowCoveringForm] = useState(false);
  const [coveringName, setCoveringName] = useState("");
  const [coveringError, setCoveringError] = useState("");

  useEffect(() => {
    loadEmployees();
  }, [location]);

  async function loadEmployees() {
    if (!location?.id) {
      setError("Location information is missing.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data, error: employeeError } = await supabase
        .from("employees")
        .select("*")
        .eq("location_id", location.id)
        .eq("active", true)
        .order("employee_name");

      if (employeeError) {
        console.error("Employee lookup error:", employeeError);
        setError(`Could not load employees: ${employeeError.message}`);
        return;
      }

      setEmployees(data || []);
    } catch (err) {
      console.error("Unexpected employee error:", err);
      setError("Something went wrong loading employees.");
    } finally {
      setLoading(false);
    }
  }

  function cleanName(value) {
    return value.replace(/\s+/g, " ").trim();
  }

  function handleCoveringEmployee() {
    setCoveringName("");
    setCoveringError("");
    setShowCoveringForm(true);
  }

  function handleCoveringSubmit(e) {
    e.preventDefault();

    const fullName = cleanName(coveringName);

    if (!fullName) {
      setCoveringError("Please enter your first and last name.");
      return;
    }

    const nameParts = fullName.split(" ").filter(Boolean);

    if (nameParts.length < 2) {
      setCoveringError("Please enter both your first and last name.");
      return;
    }

    onEmployeeSelected({
      id: null,
      employee_name: fullName,
      covering: true,
    });
  }

  function handleCoveringBack() {
    setShowCoveringForm(false);
    setCoveringName("");
    setCoveringError("");
  }

  return (
    <div className="login-app">
      <header className="login-header">
        <div className="login-brand">
          <div className="login-logo spark-login-logo">
            <img src="/spark-192.png" alt="Spark" />
          </div>

          <div>
            <div className="login-brand-name">SOUTH CAFÉ LA</div>

            <div className="login-brand-subtitle">OPERATIONS</div>
          </div>
        </div>
      </header>

      <main className="login-main">
        <div className="login-card employee-card">
          {showCoveringForm ? (
            <>
              <button
                type="button"
                className="back-button"
                onClick={handleCoveringBack}
              >
                ← Back
              </button>

              <h1>Covering This Location</h1>

              <p className="login-description">
                {location?.school_name || "School"}
              </p>

              <p className="login-description">
                Enter your first and last name so your Finish Line work can be
                identified.
              </p>

              <form onSubmit={handleCoveringSubmit}>
                <div
                  style={{
                    textAlign: "left",
                    marginTop: "20px",
                  }}
                >
                  <label
                    htmlFor="coveringName"
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: "700",
                      marginBottom: "7px",
                    }}
                  >
                    First and Last Name
                  </label>

                  <input
                    id="coveringName"
                    type="text"
                    value={coveringName}
                    autoFocus
                    autoComplete="name"
                    placeholder="Example: Maria Lopez"
                    onChange={(e) => {
                      setCoveringName(e.target.value);
                      setCoveringError("");
                    }}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "13px 14px",
                      borderRadius: "9px",
                      border: coveringError
                        ? "1px solid #d84a4a"
                        : "1px solid #d7dee5",
                      fontSize: "15px",
                      outline: "none",
                    }}
                  />
                </div>

                {coveringError && (
                  <div
                    className="login-error"
                    style={{
                      marginTop: "10px",
                    }}
                  >
                    {coveringError}
                  </div>
                )}

                <button
                  type="submit"
                  className="employee-button covering"
                  style={{
                    width: "100%",
                    marginTop: "18px",
                    justifyContent: "center",
                  }}
                >
                  <span>Continue</span>

                  <span className="employee-arrow">›</span>
                </button>
              </form>
            </>
          ) : (
            <>
              <button className="back-button" onClick={onBack}>
                ← Back
              </button>

              <h1>{location?.school_name || "School"}</h1>

              <p className="login-description">
                Who is completing today's Finish Line Check?
              </p>

              {loading && (
                <div className="login-help">Loading employees...</div>
              )}

              {error && <div className="login-error">{error}</div>}

              {!loading && !error && (
                <div className="employee-list">
                  {employees.map((employee) => (
                    <button
                      key={employee.id}
                      className="employee-button"
                      onClick={() => onEmployeeSelected(employee)}
                    >
                      <span className="employee-avatar">
                        {employee.employee_name.charAt(0)}
                      </span>

                      <span>{employee.employee_name}</span>

                      <span className="employee-arrow">›</span>
                    </button>
                  ))}

                  <button
                    className="employee-button covering"
                    onClick={handleCoveringEmployee}
                  >
                    <span className="employee-avatar">+</span>

                    <span>I'm covering this location</span>

                    <span className="employee-arrow">›</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="login-footer">South Café LA Operations</footer>
    </div>
  );
}

export default EmployeeSelectPage;
