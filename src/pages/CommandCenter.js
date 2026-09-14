import React, { useState } from "react";
import CommandCenterLegacy from "./CommandCenterLegacy";
import MealCountAuditPage from "./MealCountAuditPage";

export default function CommandCenter(props) {
  const [view, setView] = useState("dashboard"); // "dashboard" | "meal-audit"

  if (view === "meal-audit") {
    return <MealCountAuditPage onBack={() => setView("dashboard")} />;
  }

  return (
    <div>
      {/* Top Banner Button to open the Audit Tool */}
      <div
        style={{
          background: "#1b4332",
          padding: "8px 16px",
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        <button
          onClick={() => setView("meal-audit")}
          style={{
            background: "#2d6a4f",
            color: "#fff",
            border: "1px solid #52b788",
            borderRadius: "6px",
            padding: "6px 14px",
            fontWeight: "700",
            fontSize: "12px",
            cursor: "pointer",
          }}
        >
          🔍 Open Meal Count Audit & Reconciliation
        </button>
      </div>

      <CommandCenterLegacy {...props} />
    </div>
  );
}
