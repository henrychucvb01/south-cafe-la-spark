import React, { useEffect, useRef, useState } from "react";

const LEAFLET_SCRIPT = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_STYLES = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
let leafletPromise;

function loadStylesheet() {
  const existing = document.querySelector(`link[href="${LEAFLET_STYLES}"]`);
  if (existing?.sheet) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = existing || document.createElement("link");
    link.addEventListener("load", resolve, { once: true });
    link.addEventListener("error", () => reject(new Error("Leaflet styles could not be loaded.")), { once: true });
    if (!existing) {
      link.rel = "stylesheet";
      link.href = LEAFLET_STYLES;
      link.integrity = "sha256-p4NxAoJBhIINfQ3ynhHdG8pQmZbK8f5A8wXQmxhA+g=";
      link.crossOrigin = "";
      document.head.appendChild(link);
    }
  });
}

function loadScript() {
  if (window.L) return Promise.resolve(window.L);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${LEAFLET_SCRIPT}"]`);
    const script = existing || document.createElement("script");
    const done = () => window.L ? resolve(window.L) : reject(new Error("Leaflet did not initialize."));
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => reject(new Error("Leaflet could not be loaded.")), { once: true });
    if (!existing) {
      script.src = LEAFLET_SCRIPT;
      script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
      script.crossOrigin = "";
      document.body.appendChild(script);
    }
  });
}

function loadLeaflet() {
  if (!leafletPromise) {
    // Match the original working page: CSS is ready before Leaflet JS and map creation.
    leafletPromise = loadStylesheet().then(loadScript);
  }
  return leafletPromise;
}

function popupRow(label, value) {
  const row = document.createElement("div");
  const term = document.createElement("strong");
  term.textContent = `${label}: `;
  row.appendChild(term);
  row.appendChild(document.createTextNode(value || "Not listed"));
  return row;
}

function LocationMap({ records, selectedId, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const onSelectRef = useRef(onSelect);
  const [error, setError] = useState("");
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    const mapped = records.filter((item) => item.latitude != null && item.longitude != null && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)));

    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const map = L.map(containerRef.current).setView([33.7701, -118.1937], 12);
      mapRef.current = map;
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap",
      }).addTo(map);

      const bounds = [];
      mapped.forEach((record) => {
        const point = [Number(record.latitude), Number(record.longitude)];
        bounds.push(point);
        const marker = L.circleMarker(point, { radius: 8, weight: 2, color: "#0d638f", fillColor: "#2a91be", fillOpacity: 0.9, keyboard: true });
        const popup = document.createElement("div");
        popup.className = "location-map-popup";
        const title = document.createElement("h3");
        title.textContent = record.school_name;
        popup.appendChild(title);
        popup.appendChild(popupRow("Location", record.location_code));
        popup.appendChild(popupRow("FSM / Manager", record.manager_name?.toLocaleUpperCase()));
        popup.appendChild(popupRow("Cafeteria", record.cafeteria_phone));
        popup.appendChild(popupRow("School", record.school_phone));
        marker.bindPopup(popup);
        marker.on("click", () => onSelectRef.current(record.id));
        marker.addTo(map);
        markersRef.current.set(record.id, marker);
      });
      if (bounds.length) map.fitBounds(bounds, { padding: [24, 24] });
      markersRef.current.get(selectedId)?.openPopup();
    }).catch((err) => !cancelled && setError(err.message || "The map could not be loaded."));

    return () => {
      cancelled = true;
      markersRef.current.clear();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [records]);

  useEffect(() => {
    markersRef.current.get(selectedId)?.openPopup();
  }, [selectedId]);

  if (error) return <div className="location-info-state error" role="alert">{error} Use Directory view to browse locations.</div>;
  return <div ref={containerRef} className="location-map-canvas" aria-label="Interactive map of area schools" />;
}

export default LocationMap;
