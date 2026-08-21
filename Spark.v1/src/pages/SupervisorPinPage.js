import React, { useState } from "react";

function SupervisorPinPage({ onSuccess, onBack }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  // Prototype PIN only.
  // Later we will move this to Supabase.
  const supervisorPin = "0928";

  function handleSubmit(e) {
    e.preventDefault();

    if (pin === supervisorPin) {
      setError("");
      onSuccess();
      return;
    }

    setError("Incorrect supervisor PIN.");
    setPin("");
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
                const value = e.target.value.replace(/\D/g, "");

                setPin(value);
                setError("");
              }}
              autoFocus
            />

            {error && <div className="login-error">{error}</div>}

            <button
              type="submit"
              className="login-primary-button supervisor-primary-button"
              disabled={pin.length !== 4}
            >
              Open Command Center
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

export default SupervisorPinPage;
