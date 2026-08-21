import React from "react";

function YesNoButtons({ value, onChange, allowNA = false }) {
  return (
    <div className="yes-no-group">
      <button
        type="button"
        className={`yes-no-button ${value === "yes" ? "selected-good" : ""}`}
        onClick={() => onChange("yes")}
      >
        Yes
      </button>

      <button
        type="button"
        className={`yes-no-button ${value === "no" ? "selected-danger" : ""}`}
        onClick={() => onChange("no")}
      >
        No
      </button>

      {allowNA && (
        <button
          type="button"
          className={`yes-no-button ${
            value === "na" ? "selected-neutral" : ""
          }`}
          onClick={() => onChange("na")}
        >
          N/A
        </button>
      )}
    </div>
  );
}

export default YesNoButtons;
