import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { cleanManagerPin, shouldAutoVerifyManagerPin } from "../security/managerPinUtils";

function ManagerPinPage({ location, employee, onSuccess, onBack }) {
  const [mode, setMode] = useState("loading");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isCovering = employee?.covering === true;

  useEffect(() => {
    checkPinStatus();
  }, [employee?.id, isCovering]);

  async function checkPinStatus() {
    setMessage("");
    setPin("");
    setConfirmPin("");

    if (isCovering) {
      setMode("verify-covering");
      return;
    }

    if (!employee?.id) {
      setMessage("Employee information is missing.");
      setMode("error");
      return;
    }

    setMode("loading");

    try {
      const { data, error } = await supabase.rpc("has_manager_pin", {
        p_employee_id: String(employee.id),
      });

      if (error) {
        throw error;
      }

      setMode(data === true ? "verify" : "create");
    } catch (error) {
      console.error("PIN status error:", error);
      setMessage(
        "SPARK could not check your PIN. Please try again or contact your supervisor."
      );
      setMode("error");
    }
  }

  function cleanPin(value) {
    return cleanManagerPin(value);
  }

  function handlePinChange(value) {
    const nextPin = cleanPin(value);
    setPin(nextPin);
    setMessage("");
    if (shouldAutoVerifyManagerPin({ pin: nextPin, mode, submitting })) {
      verifyEnteredPin(nextPin);
    }
  }

  function handleConfirmChange(value) {
    setConfirmPin(cleanPin(value));
    setMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (pin.length !== 4) {
      setMessage("Enter a 4-digit PIN.");
      return;
    }

    if (mode === "create" && confirmPin !== pin) {
      setMessage("The PINs do not match. Please try again.");
      return;
    }

    if (mode === "verify" || mode === "verify-covering") {
      await verifyEnteredPin(pin);
      return;
    }

    setSubmitting(true);
    setMessage("");

    try {
      if (mode === "create") {
        const { data, error } = await supabase.rpc("set_manager_pin", {
          p_employee_id: String(employee.id),
          p_pin: pin,
        });

        if (error) {
          throw error;
        }

        if (data !== true) {
          setMessage(
            "A PIN may already exist for this manager. Go back and select your name again."
          );
          return;
        }

        onSuccess();
      }
    } catch (error) {
      console.error("Manager PIN error:", error);
      setMessage(
        "SPARK could not verify your PIN. Please try again or contact your supervisor."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyEnteredPin(pinToVerify) {
    if (pinToVerify.length !== 4 || submitting) return;
    setSubmitting(true);
    setMessage("");

    try {
      if (mode === "verify-covering") {
        const { data, error } = await supabase.rpc("verify_covering_pin", {
          p_pin: pinToVerify,
        });

        if (error) {
          throw error;
        }

        if (data !== true) {
          setMessage("That temporary PIN is not correct.");
          setPin("");
          return;
        }

        onSuccess();
        return;
      }

      const { data, error } = await supabase.rpc("verify_manager_pin", {
        p_employee_id: String(employee.id),
        p_pin: pinToVerify,
      });

      if (error) {
        throw error;
      }

      if (data !== true) {
        setMessage("That PIN is not correct. Please try again.");
        setPin("");
        return;
      }

      onSuccess();
    } catch (error) {
      console.error("Manager PIN error:", error);
      setMessage(
        "SPARK could not verify your PIN. Please try again or contact your supervisor."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const creating = mode === "create";
  const covering = mode === "verify-covering";

  const resetEmailHref = `mailto:huy.l.nguyen@lausd.net?subject=${encodeURIComponent(
    "SPARK PIN Reset Request"
  )}&body=${encodeURIComponent(
    `Hello Huy,

I need my SPARK PIN reset.

Manager: ${employee?.employee_name || "Manager"}
School: ${location?.school_name || "School"}
Location: ${location?.location_code || ""}

Please contact me to verify my identity before resetting my PIN.`
  )}`;

  return (
    <div className="login-app">
      <header className="login-header">
        <div className="login-brand">
          <div className="login-logo spark-login-logo">
            <img src="/spark-192.png" alt="Spark" />
          </div>

          <div>
            <div className="login-brand-name">SOUTH CAFÉ LA</div>
            <div className="login-brand-subtitle">SPARK SECURITY</div>
          </div>
        </div>
      </header>

      <main className="login-main">
        <div className="login-card manager-pin-card">
          <button
            type="button"
            className="back-button"
            onClick={onBack}
            disabled={submitting}
          >
            ← Back
          </button>

          <div className="manager-pin-lock">🔐</div>

          <h1>
            {creating
              ? "Create Your SPARK PIN"
              : covering
              ? "Temporary Manager PIN"
              : "Enter Your SPARK PIN"}
          </h1>

          <p className="login-description">
            {location?.school_name || "Selected School"}
          </p>

          <div className="manager-pin-name">
            {employee?.employee_name || "Manager"}
            {isCovering ? " • Covering" : ""}
          </div>

          {mode === "loading" ? (
            <div className="login-help">Checking PIN...</div>
          ) : mode === "error" ? (
            <>
              {message && <div className="login-error">{message}</div>}

              <button
                type="button"
                className="login-button"
                onClick={checkPinStatus}
              >
                Try Again
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <p className="manager-pin-instruction">
                {creating
                  ? "Choose a 4-digit PIN you will remember. You will use this PIN when signing into SPARK."
                  : covering
                  ? "Enter the temporary covering-manager PIN."
                  : "Enter the 4-digit PIN you created for SPARK."}
              </p>

              <label className="manager-pin-label" htmlFor="managerPin">
                {creating ? "Create PIN" : "4-Digit PIN"}
              </label>

              <input
                id="managerPin"
                className="manager-pin-input"
                type="password"
                inputMode="numeric"
                autoFocus
                autoComplete="off"
                maxLength={4}
                value={pin}
                onChange={(e) => handlePinChange(e.target.value)}
                placeholder="••••"
              />

              {!creating && !covering && (
                <a
                  className="manager-pin-reset-link"
                  href={resetEmailHref}
                >
                  Forgot your PIN? Request a reset
                </a>
              )}

              {creating && (
                <>
                  <label
                    className="manager-pin-label"
                    htmlFor="managerPinConfirm"
                  >
                    Confirm PIN
                  </label>

                  <input
                    id="managerPinConfirm"
                    className="manager-pin-input"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                    value={confirmPin}
                    onChange={(e) => handleConfirmChange(e.target.value)}
                    placeholder="••••"
                  />
                </>
              )}

              {message && <div className="login-error">{message}</div>}

              <button
                type="submit"
                className="login-button manager-pin-submit"
                disabled={
                  submitting ||
                  pin.length !== 4 ||
                  (creating && confirmPin.length !== 4)
                }
              >
                {submitting
                  ? "Checking..."
                  : creating
                  ? "Create PIN & Continue"
                  : "Continue"}
              </button>
            </form>
          )}
        </div>
      </main>

      <footer className="login-footer">
        SPARK • South Café LA Operations Assistant
      </footer>
    </div>
  );
}

export default ManagerPinPage;
