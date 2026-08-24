import React, { useState } from "react";
import { supabase } from "../supabaseClient";

function SupervisorPinPage({ onSuccess, onBack }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();

    if (pin.length !== 4) {
      setError("Enter your 4-digit supervisor PIN.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const { data, error: verifyError } = await supabase.rpc(
        "verify_supervisor_pin",
        {
          p_pin: pin,
        }
      );

      if (verifyError) {
        throw verifyError;
      }

      if (data !== true) {
        setError("Incorrect supervisor PIN.");
        setPin("");
        return;
      }

      onSuccess(pin);
    } catch (err) {
      console.error("Supervisor PIN error:", err);
      setError("SPARK could not verify supervisor access. Please try again.");
    } finally {
      setSubmitting(false);
    }
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
            <div className="login-brand-subtitle">SUPERVISOR ACCESS</div>
          </div>
        </div>
      </header>

      <main className="login-main">
        <div className="login-card">
          <h1>Supervisor Access</h1>

          <p className="login-description">
            Enter your 4-digit supervisor PIN.
          </p>

          <form onSubmit={handleSubmit}>
            <label className="login-label">Supervisor PIN</label>

            <input
              className="location-input"
              type="password"
              inputMode="numeric"
              maxLength="4"
              placeholder="••••"
              value={pin}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "").slice(0, 4);
                setPin(value);
                setError("");
              }}
              autoFocus
            />

            {error && <div className="login-error">{error}</div>}

            <button
              type="submit"
              className="login-primary-button supervisor-primary-button"
              disabled={pin.length !== 4 || submitting}
            >
              {submitting ? "Checking..." : "Open Command Center"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default SupervisorPinPage;
