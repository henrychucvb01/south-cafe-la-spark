import React from "react";

function ContactLink({ value, type = "tel" }) {
  if (!value) return <span>Not listed</span>;
  const href = type === "email" ? `mailto:${value}` : `tel:${value.replace(/[^\d+]/g, "")}`;
  return <a href={href}>{value}</a>;
}

function AreaSupervisorCard({ supervisor, compact = false }) {
  return (
    <section className={`area-supervisor-card ${compact ? "compact" : ""}`} aria-labelledby={compact ? "supervisor-editor-heading" : "area-supervisor-heading"}>
      <div className="area-supervisor-mark" aria-hidden="true">AS</div>
      <div className="area-supervisor-copy">
        <span>AREA FOOD SERVICES SUPERVISOR</span>
        <h2 id={compact ? "supervisor-editor-heading" : "area-supervisor-heading"}>{supervisor?.full_name || "Not assigned"}</h2>
      </div>
      <dl>
        <div><dt>Email</dt><dd><ContactLink value={supervisor?.email} type="email" /></dd></div>
        <div><dt>Cell</dt><dd><ContactLink value={supervisor?.cell_phone} /></dd></div>
      </dl>
    </section>
  );
}

export default AreaSupervisorCard;
