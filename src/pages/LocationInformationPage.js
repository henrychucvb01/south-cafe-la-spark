import React, { useEffect, useMemo, useState } from "react";
import {
  filterLocationDirectory,
  formatLocationUpdatedAt,
  loadLocationDirectory,
} from "../locationInformation/locationInformationService";

function ContactLink({ value, type = "tel" }) {
  if (!value) return <span>Not listed</span>;
  const href = type === "email" ? `mailto:${value}` : `tel:${value.replace(/[^\d+]/g, "")}`;
  return <a href={href}>{value}</a>;
}

function LocationDetails({ record, ownLocation = false }) {
  if (!record) return null;
  return (
    <article className={`location-info-details ${ownLocation ? "own-location" : ""}`}>
      <div className="location-info-details-header">
        <div>
          <span>{ownLocation ? "YOUR LOCATION" : `LOCATION ${record.location_code || "NOT ASSIGNED"}`}</span>
          <h2>{record.school_name}</h2>
        </div>
        <div className="location-info-tags"><span>{record.site_type || "Type not listed"}</span><span>{record.counting_claiming || "C&C not listed"}</span></div>
      </div>
      <dl className="location-info-grid">
        <div><dt>Location code</dt><dd>{record.location_code || "Not assigned"}</dd></div>
        <div><dt>FSM / Manager</dt><dd>{record.manager_name || "Not listed"}</dd></div>
        <div><dt>Cafeteria phone</dt><dd><ContactLink value={record.cafeteria_phone} /></dd></div>
        <div><dt>School phone</dt><dd><ContactLink value={record.school_phone} /></dd></div>
        <div><dt>Area supervisor</dt><dd>{record.supervisor_name || "Not listed"}</dd></div>
        <div><dt>Supervisor email</dt><dd><ContactLink value={record.supervisor_email} type="email" /></dd></div>
        <div><dt>Supervisor cell</dt><dd><ContactLink value={record.supervisor_cell} /></dd></div>
        <div><dt>Last updated</dt><dd>{formatLocationUpdatedAt(record.updated_at)}</dd></div>
      </dl>
    </article>
  );
}

function LocationInformationPage({ location, onBack }) {
  const [records, setRecords] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    loadLocationDirectory()
      .then((data) => {
        if (!active) return;
        setRecords(data);
        const own = data.find((item) => String(item.location_code) === String(location?.location_code));
        setSelectedId(own?.id || data[0]?.id || null);
      })
      .catch((err) => active && setError(err.message || "Could not load the area directory."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [location?.location_code]);

  const ownLocation = records.find((item) => String(item.location_code) === String(location?.location_code));
  const filtered = useMemo(() => filterLocationDirectory(records, query), [records, query]);
  const selected = records.find((item) => item.id === selectedId);

  return (
    <div className="manager-resources-page location-info-page">
      <header className="login-header">
        <div className="login-brand"><div className="login-logo spark-login-logo"><img src="/spark-192.png" alt="SPARK" /></div><div><div className="login-brand-name">SOUTH CAFÉ LA</div><div className="login-brand-subtitle">LOCATION INFORMATION</div></div></div>
        <button type="button" className="homebase-exit-button" onClick={onBack}>← Manager Resources</button>
      </header>
      <main className="location-info-main">
        <section className="location-info-hero"><span>AREA DIRECTORY</span><h1>Location information</h1><p>View your school contact details or quickly find another cafeteria in the area.</p></section>
        {loading && <div className="location-info-state" role="status">Loading location information…</div>}
        {error && <div className="location-info-state error" role="alert">{error}</div>}
        {!loading && !error && <>
          {ownLocation ? <LocationDetails record={ownLocation} ownLocation /> : <div className="location-info-state">Your location is not yet connected to the area directory. You can still browse all locations below.</div>}
          <section className="location-directory-section">
            <div className="location-directory-heading"><div><span>ALL LOCATIONS</span><h2>Browse the area</h2></div><label><span className="sr-only">Search locations</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search school, code, manager, or type" /></label></div>
            <div className="location-directory-layout">
              <div className="location-directory-list" role="list" aria-label="Area locations">
                {filtered.map((record) => <button type="button" role="listitem" key={record.id} className={record.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(record.id)}><span><strong>{record.school_name}</strong><small>{record.location_code ? `Location ${record.location_code}` : "Location code not assigned"}</small></span><span>{record.site_type || "—"}</span></button>)}
                {!filtered.length && <p className="location-directory-empty">No locations match “{query}”.</p>}
              </div>
              <LocationDetails record={selected} />
            </div>
          </section>
        </>}
      </main>
    </div>
  );
}

export default LocationInformationPage;
