import React, { useEffect, useRef, useState } from "react";

const LEAFLET_SCRIPT = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_STYLES = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!document.querySelector(`link[href="${LEAFLET_STYLES}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LEAFLET_STYLES;
    link.integrity = "sha256-p4NxAoJBhIINfQ3ynhHdG8pQmZbK8f5A8wXQmxhA+g=";
    link.crossOrigin = "";
    document.head.appendChild(link);
  }
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${LEAFLET_SCRIPT}"]`);
    const script = existing || document.createElement("script");
    const done = () => window.L ? resolve(window.L) : reject(new Error("Map library did not load."));
    if (existing) {
      existing.addEventListener("load", done, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    script.src = LEAFLET_SCRIPT;
    script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
    script.crossOrigin = "";
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => reject(new Error("The map could not be loaded.")), { once: true });
    document.body.appendChild(script);
  });
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
  const onSelectRef = useRef(onSelect);
  const [error, setError] = useState("");
  onSelectRef.current = onSelect;

  useEffect(() => {
    let map;
    let resizeObserver;
    let resizeTimer;
    let animationFrame;
    let cancelled = false;
    const mapped = records.filter((item) => item.latitude != null && item.longitude != null && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)));
    loadLeaflet().then((L) => {
      if (cancelled || !containerRef.current) return;
      map = L.map(containerRef.current, { scrollWheelZoom: false }).setView([33.82, -118.26], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      const bounds = [];
      mapped.forEach((record) => {
        const point = [Number(record.latitude), Number(record.longitude)];
        bounds.push(point);
        const marker = L.marker(point, { title: record.school_name, keyboard: true }).addTo(map);
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
        if (record.id === selectedId) marker.openPopup();
      });
      const fitMap = () => {
        if (!map || cancelled) return;
        map.invalidateSize({ pan: false });
        if (bounds.length) map.fitBounds(bounds, { padding: [24, 24] });
      };
      fitMap();
      animationFrame = window.requestAnimationFrame(() => {
        fitMap();
        resizeTimer = window.setTimeout(fitMap, 180);
      });
      if (window.ResizeObserver && containerRef.current) {
        resizeObserver = new ResizeObserver(() => map && map.invalidateSize({ pan: false }));
        resizeObserver.observe(containerRef.current);
      }
    }).catch((err) => !cancelled && setError(err.message || "The map could not be loaded."));
    return () => {
      cancelled = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      if (resizeTimer) window.clearTimeout(resizeTimer);
      if (resizeObserver) resizeObserver.disconnect();
      if (map) map.remove();
    };
  }, [records, selectedId]);

  if (error) return <div className="location-info-state error" role="alert">{error} Use Directory view to browse locations.</div>;
  return <div ref={containerRef} className="location-map-canvas" aria-label="Interactive map of area schools" />;
}

export default LocationMap;
