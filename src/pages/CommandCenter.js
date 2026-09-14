import React, { useState } from "react";
import CommandCenterLegacy from "./CommandCenterLegacy";
import MealCountAuditPage from "./MealCountAuditPage";

export default function CommandCenter(props) {
  const [view, setView] = useState("dashboard"); // "dashboard" | "meal-audit"

  // When inside the audit page, pass all props so schools load instantly
  if (view === "meal-audit") {
    return <MealCountAuditPage {...props} onBack={() => setView("dashboard")} />;
  }

  return (
    <div>
      {/* Top Banner with Audit Page Button */}
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
            color: "#ffffff",
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

      {/* Main Dashboard */}
      <CommandCenterLegacy {...props} />
    </div>
  );
}
