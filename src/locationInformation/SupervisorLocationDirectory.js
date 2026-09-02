import React, { useEffect, useMemo, useState } from "react";
import {
  filterLocationDirectory,
  loadAreaSupervisor,
  loadLocationDirectory,
  saveLocationInformation,
} from "./locationInformationService";
import AreaSupervisorCard from "./AreaSupervisorCard";

const EDITABLE_FIELDS = [
  ["location_code", "Location code"],
  ["school_name", "School name"],
  ["address", "School address"],
  ["manager_name", "FSM / Manager"],
  ["site_type", "Site type"],
  ["counting_claiming", "Counting & Claiming"],
  ["cafeteria_phone", "Cafeteria phone"],
  ["school_phone", "School phone"],
];

function SupervisorLocationDirectory({ supervisorPin }) {
  const [records, setRecords] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [supervisor, setSupervisor] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function reload(preferredId) {
    setLoading(true);
    setError("");
    try {
      const data = await loadLocationDirectory();
      setRecords(data);
      const next = data.find((item) => item.id === (preferredId || selectedId)) || data[0] || null;
      setSelectedId(next?.id || null);
      setDraft(next ? { ...next } : null);
    } catch (err) {
      setError(err.message || "Could not load the location directory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    loadAreaSupervisor().then(setSupervisor).catch(() => setSupervisor(null));
  }, []);

  const filtered = useMemo(() => filterLocationDirectory(records, query), [records, query]);

  function selectRecord(record) {
    setSelectedId(record.id);
    setDraft({ ...record });
    setMessage("");
    setError("");
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!draft?.school_name?.trim()) {
      setError("School name is required.");
      return;
    }
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const updated = await saveLocationInformation(draft, supervisorPin);
      setMessage("Location information saved. Managers now see this updated record.");
      await reload(updated?.id || draft.id);
    } catch (err) {
      setError(err.message || "Could not save location information.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="supervisor-location-directory">
      <section className="dashboard-card supervisor-location-intro">
        <div className="command-section-header"><div><h3>Area Location Directory</h3><p>Edit the contact and operating details managers see in Location Information.</p></div><button type="button" className="command-refresh" onClick={() => reload()} disabled={loading}>↻ Refresh</button></div>
      </section>
      <AreaSupervisorCard supervisor={supervisor} compact />
      {error && <div className="command-error" role="alert">{error}</div>}
      {message && <div className="location-save-message" role="status">{message}</div>}
      <div className="supervisor-location-workspace">
        <section className="dashboard-card supervisor-location-list-card">
          <label className="supervisor-location-search"><span>Search locations</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="School, code, manager, or type" /></label>
          <div className="supervisor-location-list">
            {filtered.map((record) => <button type="button" key={record.id} className={record.id === selectedId ? "selected" : ""} onClick={() => selectRecord(record)}><strong>{record.school_name}</strong><small>{record.location_code ? `Location ${record.location_code}` : "No location code"} · {record.manager_name || "Manager not listed"}</small></button>)}
            {!loading && !filtered.length && <p>No matching locations.</p>}
          </div>
        </section>
        <section className="dashboard-card supervisor-location-editor">
          {loading && <div className="command-loading">Loading directory…</div>}
          {!loading && draft && <form onSubmit={handleSave}>
            <div className="command-section-header"><div><h3>{draft.school_name}</h3><p>Location {draft.location_code || "not assigned"}</p></div>{draft.counting_claiming && <span className="location-editor-status">{draft.counting_claiming}</span>}</div>
            <div className="supervisor-location-form-grid">
              {EDITABLE_FIELDS.map(([name, label]) => <label key={name}><span>{label}</span>{name === "site_type" ? <select value={draft[name] || ""} onChange={(event) => setDraft((current) => ({ ...current, [name]: event.target.value }))}><option value="">Select site type</option><option value="PREP">PREP</option><option value="NNC">NNC</option></select> : <input type="text" value={draft[name] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, [name]: event.target.value }))} required={name === "school_name"} />}</label>)}
            </div>
            <div className="supervisor-location-actions"><button type="button" className="command-small-button" onClick={() => selectRecord(records.find((item) => item.id === selectedId))} disabled={saving}>Discard changes</button><button type="submit" className="login-primary-button" disabled={saving}>{saving ? "Saving…" : "Save location"}</button></div>
          </form>}
        </section>
      </div>
    </div>
  );
}

export default SupervisorLocationDirectory;
