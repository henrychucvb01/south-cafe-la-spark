import React, { useEffect, useMemo, useState } from "react";
import {
  filterLocationDirectory,
  loadAreaSupervisor,
  loadLocationDirectory,
} from "../locationInformation/locationInformationService";
import AreaSupervisorCard from "../locationInformation/AreaSupervisorCard";
import LocationMap from "../locationInformation/LocationMap";

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
          <span>{ownLocation ? `YOUR LOCATION · ${record.location_code || "CODE NOT ASSIGNED"}` : `LOCATION ${record.location_code || "NOT ASSIGNED"}`}</span>
          <h2>{record.school_name}</h2>
        </div>
        <div className="location-info-tags">{record.counting_claiming && <span>{record.counting_claiming}</span>}</div>
      </div>
      <dl className="location-info-grid">
        <div><dt>FSM / Manager</dt><dd>{record.manager_name?.toLocaleUpperCase() || "Not listed"}</dd></div>
        <div className="location-site-type"><dt>Site type</dt><dd>{record.site_type?.toLocaleUpperCase() || "Not listed"}</dd></div>
        <div><dt>Cafeteria phone</dt><dd><ContactLink value={record.cafeteria_phone} /></dd></div>
        <div><dt>School phone</dt><dd><ContactLink value={record.school_phone} /></dd></div>
      </dl>
    </article>
  );
}

function MapLocationCard({ record }) {
  if (!record) {
    return (
      <aside className="location-map-listing location-map-listing-empty">
        <p>Select a school marker to view its location information.</p>
      </aside>
    );
  }

  return (
    <aside className="location-map-listing" aria-live="polite" aria-label={`Selected school: ${record.school_name}`}>
      <div className="location-map-photo" aria-label="School photo placeholder">
        <span aria-hidden="true">▧</span>
        <p>School photo coming soon</p>
      </div>
      <div className="location-map-listing-copy">
        <div className="location-map-listing-heading">
          <div>
            <h2>{record.school_name}</h2>
            <p>Location {record.location_code || "not assigned"}</p>
          </div>
          {record.counting_claiming?.toLocaleUpperCase() === "CEP" && <span className="location-map-cep">CEP</span>}
        </div>
        <div className={`location-map-address ${record.address ? "" : "is-empty"}`}>
          <span aria-hidden="true">⌖</span>
          <p>{record.address || "Address not currently listed"}</p>
        </div>
      </div>
    </aside>
  );
}

function LocationInformationPage({ location, onBack }) {
  const [records, setRecords] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [supervisor, setSupervisor] = useState(null);
  const [view, setView] = useState("directory");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([loadLocationDirectory(), loadAreaSupervisor()])
      .then(([data, areaSupervisor]) => {
        if (!active) return;
        setRecords(data);
        setSupervisor(areaSupervisor);
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
          <AreaSupervisorCard supervisor={supervisor} />
          {ownLocation ? <LocationDetails record={ownLocation} ownLocation /> : <div className="location-info-state">Your location is not yet connected to the area directory. You can still browse all locations below.</div>}
          <section className="location-directory-section">
            <div className="location-directory-heading"><div><span>ALL LOCATIONS</span><h2>Browse the area</h2></div><div className="location-directory-controls"><div className="location-view-toggle" role="group" aria-label="Choose directory or map view"><button type="button" className={view === "directory" ? "active" : ""} aria-pressed={view === "directory"} onClick={() => setView("directory")}>☷ Directory</button><button type="button" className={view === "map" ? "active" : ""} aria-pressed={view === "map"} onClick={() => setView("map")}>⌖ Map</button></div>{view === "directory" && <label><span className="sr-only">Search locations</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search school, code, manager, or type" /></label>}</div></div>
            {view === "directory" ? <div className="location-directory-layout">
              <div className="location-directory-list" role="list" aria-label="Area locations">
                {filtered.map((record) => <button type="button" role="listitem" key={record.id} className={record.id === selectedId ? "selected" : ""} onClick={() => setSelectedId(record.id)}><span><strong>{record.school_name}</strong><small>{record.location_code ? `Location ${record.location_code}` : "Location code not assigned"}</small></span><span>{record.site_type?.toLocaleUpperCase() || "—"}</span></button>)}
                {!filtered.length && <p className="location-directory-empty">No locations match “{query}”.</p>}
              </div>
              <LocationDetails record={selected} />
            </div> : <div className="location-map-layout"><LocationMap records={records} selectedId={selectedId} onSelect={setSelectedId} /><MapLocationCard record={selected} /></div>}
          </section>
        </>}
      </main>
    </div>
  );
}

export default LocationInformationPage;
