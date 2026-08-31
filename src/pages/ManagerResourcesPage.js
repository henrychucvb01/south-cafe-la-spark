import React from "react";

function ResourceLink({ icon, title, description, url, unavailableText }) {
  if (url) {
    return (
      <a className="manager-resource-card" href={url} target="_blank" rel="noreferrer">
        <span className="manager-resource-icon" aria-hidden="true">{icon}</span>
        <span><strong>{title}</strong><small>{description}</small></span>
        <span className="manager-resource-arrow" aria-hidden="true">↗</span>
      </a>
    );
  }
  return (
    <div className="manager-resource-card manager-resource-unavailable" aria-label={`${title}: ${unavailableText}`}>
      <span className="manager-resource-icon" aria-hidden="true">{icon}</span>
      <span><strong>{title}</strong><small>{unavailableText}</small></span>
    </div>
  );
}

function ManagerResourcesPage({ onAskSpark, onBack }) {
  const foodExchangeUrl = process.env.REACT_APP_FOOD_EXCHANGE_URL;
  const equipmentExchangeUrl = process.env.REACT_APP_EQUIPMENT_EXCHANGE_URL;
  return (
    <div className="manager-resources-page">
      <header className="login-header">
        <div className="login-brand">
          <div className="login-logo spark-login-logo"><img src="/spark-192.png" alt="Spark" /></div>
          <div><div className="login-brand-name">SOUTH CAFÉ LA</div><div className="login-brand-subtitle">SPARK</div></div>
        </div>
        <button type="button" className="homebase-exit-button" onClick={onBack}>← Back to Home Base</button>
      </header>
      <main className="manager-resources-main">
        <section className="manager-resources-hero">
          <span>MANAGER RESOURCES</span>
          <h1>Guidance and manager tools</h1>
          <p>Find training guidance or open the exchange tools used by your operation.</p>
        </section>
        <section className="manager-resources-grid" aria-label="Manager resource tools">
          <button type="button" className="manager-resource-card manager-resource-ask" onClick={onAskSpark}>
            <span className="manager-resource-icon" aria-hidden="true">✦</span>
            <span><strong>Ask SPARK</strong><small>Ask a cafeteria operations question and see the approved training sources behind the answer.</small></span>
            <span className="manager-resource-arrow" aria-hidden="true">›</span>
          </button>
          <ResourceLink icon="🥕" title="Food Exchange" description="Open the Food Exchange." url={foodExchangeUrl} unavailableText="Existing exchange link is not configured in this deployment." />
          <ResourceLink icon="⚙️" title="Equipment Exchange" description="Open the Equipment Exchange." url={equipmentExchangeUrl} unavailableText="Existing exchange link is not configured in this deployment." />
        </section>
      </main>
    </div>
  );
}

export default ManagerResourcesPage;
