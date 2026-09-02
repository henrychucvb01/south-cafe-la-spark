import React, { useEffect, useMemo, useState } from "react";
import { loadLocationDirectory } from "../locationInformation/locationInformationService";

const QUICK_CONTACTS = [
  { keywords: "it computer login technology", issue: "Computer / IT support", contact: "Miguel Lopez", detail: "Sr. IT Support Technician", phone: "(213) 264-2478", email: "miguel.lopez3@lausd.net" },
  { keywords: "edison newton supper meal count pos", issue: "Edison / Newton / Supper system", contact: "Gunjan Patel", detail: "Food Service Training Specialist", phone: "(213) 549-6272", email: "gmp6685@lausd.net" },
  { keywords: "emergency meals emergency meal nnc", issue: "Emergency meals", contact: "Javier Gutierrez", detail: "Newman Nutrition Center (NNC)", phone: "(213) 503-5854", email: "jxg8390@lausd.net" },
  { keywords: "refrigerator refrigeration freezer cooler walk in cold temperature gasket ice", issue: "Refrigeration", contact: "Darrin Kendrick", detail: "Refrigeration Fitter · M&O Food Services JC-School Base", phone: "(323) 780-3288", email: "darrin.kendrick@lausd.net" },
  { keywords: "truck delivery delay hold holding shutdown sewage backup", issue: "Delivery delay / hold an order", contact: "Truck Operations", detail: "Use for delayed deliveries or holding deliveries during a shutdown, such as a sewage backup.", phone: "(562) 654-9001", secondary: "Operations: (562) 654-9003" },
  { keywords: "warehouse order prep food order missing order", issue: "Warehouse order — PREP school", contact: "Latrella Stevenson", detail: "Food Order Unit", phone: "(562) 654-9008", email: "latrella.stevenson@lausd.net" },
  { keywords: "training procedure training question", issue: "Training support", contact: "Dawn Soto", detail: "Sr. Food Service Training Specialist", phone: "(213) 923-9603", email: "dawn.soto@lausd.net" },
  { keywords: "hr human resources employee personnel", issue: "Human Resources", contact: "Babatu Hansen", detail: "HR Representative", phone: "(213) 407-9688", email: "babatu.hansen@lausd.net" },
  { keywords: "menu vendor quality food issue product quality", issue: "Menu / vendor quality / food issue", contact: "Kayley Drain or Ivy Marx", detail: "Menu Team — contact either for menu, vendor quality-control, or food-quality issues.", phone: "Kayley: (213) 407-4629 · Ivy: (213) 392-7129", email: "kayley.drain@lausd.net · ivy.marx@lausd.net" },
];

const CRAFTS = [
  { problem: "Pilot light out / oven gas", craft: "PLUMBING", contact: "M&O South Area", phone: "(310) 808-1500" },
  { problem: "Hand-wash or compartment sink clogged, leaking, or water temperature", craft: "PLUMBING", contact: "M&O South Area", phone: "(310) 808-1500" },
  { problem: "Walk-in cooler/freezer fan, ice build-up, gasket, or temperature", craft: "REFRIGERATION / HVAC", contact: "Darrin Kendrick · Refrigeration Fitter", phone: "(323) 780-3288" },
  { problem: "Milk cooler broken door or temperature", craft: "REFRIGERATION / MAINTENANCE WORKER", contact: "Darrin Kendrick · Refrigeration Fitter", phone: "(323) 780-3288" },
  { problem: "Milk cooler gasket", craft: "REFRIGERATION / HVAC", contact: "Darrin Kendrick · Refrigeration Fitter", phone: "(323) 780-3288" },
  { problem: "Food warmer temperature / oven timer", craft: "ELECTRICAL", contact: "M&O South Area", phone: "(310) 808-1500" },
  { problem: "Oven fan / hood filters", craft: "HVAC", contact: "M&O Food Services", phone: "(323) 780-3288" },
  { problem: "Cafeteria light fixtures / door fly fans", craft: "ELECTRICAL", contact: "M&O South Area", phone: "(310) 808-1500" },
  { problem: "Cafeteria ceiling tile / hole in wall", craft: "CARPENTRY", contact: "M&O South Area", phone: "(310) 808-1500" },
  { problem: "Unbolting equipment", craft: "MAINTENANCE WORKER", contact: "M&O Food Services", phone: "(323) 780-3288" },
];

function ContactCard({ item }) {
  return <article className="dashboard-card" style={{ padding: 18 }}><strong>{item.issue}</strong><p style={{ margin: "8px 0 4px" }}>{item.contact}</p><small>{item.detail}</small><div style={{ marginTop: 10 }}>{item.phone && <div><strong>Call:</strong> {item.phone}</div>}{item.secondary && <div>{item.secondary}</div>}{item.email && <div><strong>Email:</strong> {item.email}</div>}</div></article>;
}

function OperationsHelpPage({ location, onBack }) {
  const [query, setQuery] = useState("");
  const [locationRecord, setLocationRecord] = useState(null);

  useEffect(() => {
    let active = true;
    loadLocationDirectory().then((records) => {
      if (!active) return;
      setLocationRecord(records.find((item) => String(item.location_code) === String(location?.location_code)) || null);
    }).catch(() => active && setLocationRecord(null));
    return () => { active = false; };
  }, [location?.location_code]);

  const filteredContacts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return QUICK_CONTACTS;
    return QUICK_CONTACTS.filter((item) => `${item.issue} ${item.contact} ${item.detail} ${item.keywords}`.toLowerCase().includes(q));
  }, [query]);
  const filteredCrafts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CRAFTS;
    return CRAFTS.filter((item) => `${item.problem} ${item.craft} ${item.contact} ${item.phone}`.toLowerCase().includes(q));
  }, [query]);

  return <div className="manager-resources-page">
    <header className="login-header"><div className="login-brand"><div className="login-logo spark-login-logo"><img src="/spark-192.png" alt="Spark" /></div><div><div className="login-brand-name">SOUTH CAFÉ LA</div><div className="login-brand-subtitle">SPARK</div></div></div><button type="button" className="homebase-exit-button" onClick={onBack}>← Manager Resources</button></header>
    <main className="manager-resources-main">
      <section className="manager-resources-hero"><div><span>MANAGER RESOURCES</span><h1>Operations Help</h1><p>Find the right person, M&amp;O craft, or next step without using Ask SPARK.</p></div><div className="manager-resources-hero-mark" aria-hidden="true">🔧</div></section>
      <label className="supervisor-location-search" style={{ display: "block", marginBottom: 20 }}><span>What do you need help with?</span><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Try: pilot light, Edison, delivery, HR, freezer..." /></label>
      <section style={{ marginBottom: 28 }}><div className="manager-resources-heading"><div><span>QUICK ROUTING</span><h2>Who should I contact?</h2></div><p>Common Food Services contacts.</p></div><div className="manager-resources-grid">{filteredContacts.map((item) => <ContactCard key={item.issue} item={item} />)}</div></section>
      <section style={{ marginBottom: 28 }}><div className="manager-resources-heading"><div><span>MAINTENANCE &amp; OPERATIONS</span><h2>What craft do I select?</h2></div><p>Common cafeteria repairs.</p></div><div className="dashboard-card" style={{ padding: 18 }}>{filteredCrafts.length ? filteredCrafts.map((item) => <div key={item.problem} style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(190px, auto) minmax(220px, auto)", alignItems: "center", gap: 16, padding: "12px 4px", borderBottom: "1px solid #e4e9ef" }}><span>{item.problem}</span><strong>{item.craft}</strong><span style={{ textAlign: "right" }}><strong>{item.contact}</strong><br /><span>{item.phone}</span></span></div>) : <p>No matching craft found.</p>}</div></section>
      <section className="dashboard-card" style={{ padding: 20, marginBottom: 20 }}><h2 style={{ marginTop: 0 }}>Submit an M&amp;O service request</h2><p>Authenticate with your LAUSD SSO first, then open the M&amp;O Online Service Request. Enter the school, problem description, building/location detail, correct craft, type of work, your name and phone number. Review and submit the request, then record the ticket on the M&amp;O Ticket Log.</p><p><strong>Emergency during regular business hours:</strong> select your school in the M&amp;O system and call the M&amp;O Area number shown on screen.</p></section>
      <section className="dashboard-card" style={{ padding: 20, marginBottom: 20 }}><h2 style={{ marginTop: 0 }}>Pest problem</h2><p>Rodents, roaches, and ants are urgent. Submit an M&amp;O request using <strong>Pest Control</strong> as the craft. If there is no inspection within 24–48 hours, use the escalation information in the Pest Management guide.</p></section>
      <section className="dashboard-card" style={{ padding: 20 }}><h2 style={{ marginTop: 0 }}>Still not sure? Call your CPM.</h2>{locationRecord?.cpm_name ? <><p><strong>{locationRecord.cpm_name}</strong> · CPM for {locationRecord.school_name}</p>{locationRecord.cpm_office_phone && <p><strong>Office:</strong> {locationRecord.cpm_office_phone}</p>}{locationRecord.cpm_cell_phone && <p><strong>Cell:</strong> {locationRecord.cpm_cell_phone}</p>}{locationRecord.cpm_email && <p><strong>Email:</strong> {locationRecord.cpm_email}</p>}</> : <p>Your CPM contact is available in Location Information.</p>}</section>
    </main>
  </div>;
}

export default OperationsHelpPage;
