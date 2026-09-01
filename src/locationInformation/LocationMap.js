import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
  onSelectRef.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    const mapped = records.filter((item) => item.latitude != null && item.longitude != null && Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)));

    if (!cancelled && containerRef.current && !mapRef.current) {
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
    }

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

  return <div ref={containerRef} className="location-map-canvas" aria-label="Interactive map of area schools" />;
}

export default LocationMap;
