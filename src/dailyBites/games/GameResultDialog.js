import React, { useEffect, useRef } from "react";

export default function GameResultDialog({
  open,
  eyebrow,
  title,
  message,
  points,
  streakMessage,
  tone = "success",
  onClose,
}) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    closeButtonRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="game-result-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className={`game-result-dialog game-result-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-result-title"
        aria-describedby="game-result-message"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="game-result-burst" aria-hidden="true">✦</div>
        <div className="dashboard-small-label">{eyebrow}</div>
        <h3 id="game-result-title">{title}</h3>
        <p id="game-result-message">{message}</p>

        <div className="game-result-score" aria-label={`${points} SPARK points earned`}>
          <strong>{points}</strong>
          <span>SPARK {points === 1 ? "Point" : "Points"}</span>
        </div>

        <p className="game-result-streak">🔥 {streakMessage}</p>
        <button ref={closeButtonRef} type="button" onClick={onClose}>
          Back to Daily Bites
        </button>
      </div>
    </div>
  );
}
