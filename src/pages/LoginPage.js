import React, { useState } from "react";
import { supabase } from "../supabaseClient";

function LoginPage({
  onLocationSelected,
  onSupervisor,
  canInstall,
  onInstall,
}) {
  const [locationCode, setLocationCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const { data: location, error: locationError } = await supabase
        .from("locations")
        .select("*")
        .eq("location_code", locationCode)
        .eq("active", true)
        .single();

      if (locationError) {
        console.error("Location lookup error:", locationError);

        if (locationError.code === "PGRST116") {
          setError("Location code not found.");
        } else {
          setError(`Database error: ${locationError.message}`);
        }

        return;
      }

      if (!location) {
        setError("Location code not found.");
        return;
      }

      onLocationSelected(location);
    } catch (err) {
      console.error("Unexpected login error:", err);
      setError("Unable to connect to the database.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-app">
      {/* HEADER */}
      <header className="login-header">
        <div className="login-brand">
          <div className="login-logo spark-login-logo">
            <img src="/spark-192.png" alt="SPARK" />
          </div>

          <div>
            <div className="login-brand-name">SOUTH CAFÉ LA</div>
            <div className="login-brand-subtitle">OPERATIONS</div>
          </div>
        </div>

        <button
          type="button"
          className="supervisor-link"
          onClick={onSupervisor}
        >
          Supervisor Access
        </button>
      </header>

      {/* MAIN */}
      <main className="login-main">
        {/* SPARK INTRO */}
        <div className="spark-welcome">
          <div className="spark-welcome-title">SPARK</div>

          <div className="spark-welcome-subtitle">
            Helping you make smarter cafeteria operations decisions.
          </div>

          <p>
            The tools and information you need to manage your operation in one
            place.
          </p>
        </div>

        {/* MANAGER LOGIN CARD */}
        <div className="login-card">
          <h1>Welcome, Manager</h1>

          <p className="login-description">
            Enter your 4-digit location code to access your school.
          </p>

          <form onSubmit={handleSubmit}>
            <label className="login-label" htmlFor="locationCode">
              Location Code
            </label>

            <input
              id="locationCode"
              className="location-input"
              type="text"
              inputMode="numeric"
              maxLength="4"
              placeholder="0000"
              value={locationCode}
              autoFocus
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, "");

                setLocationCode(value);
                setError("");
              }}
            />

            {error && <div className="login-error">{error}</div>}

            <button
              type="submit"
              className="login-primary-button"
              disabled={locationCode.length !== 4 || loading}
            >
              {loading ? "Loading..." : "Continue"}
            </button>
          </form>

          {/* INSTALL SPARK */}
          <div className="install-section">
            <div className="install-divider"></div>

            <p className="install-text">Add SPARK for quick access.</p>

            <button
              type="button"
              className="install-app-button"
              onClick={onInstall}
            >
              ✦ Install SPARK
            </button>

            <p className="install-note">
              {canInstall
                ? "Installs SPARK as an app on this computer."
                : "If prompted, use the Install button in your browser."}
            </p>
          </div>
        </div>
      </main>

      {/* FOOTER */}
      <footer className="login-footer">South Café LA Operations</footer>
    </div>
  );
}

export default LoginPage;
