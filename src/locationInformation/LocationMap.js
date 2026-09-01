import React, { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
        const iconContent = document.createElement("div");
        iconContent.className = `location-school-marker${record.school_logo_url ? " has-logo" : ""}`;
        if (record.school_logo_url) {
          const logo = document.createElement("img");
          logo.src = record.school_logo_url;
          logo.alt = "";
          logo.addEventListener("error", () => {
            logo.remove();
            iconContent.classList.remove("has-logo");
          }, { once: true });
          iconContent.appendChild(logo);
        }
        const marker = L.marker(point, {
          icon: L.divIcon({ className: "location-school-marker-shell", html: iconContent, iconSize: [46, 46], iconAnchor: [23, 23] }),
          keyboard: true,
          title: record.school_name,
        });
        marker.on("click", () => onSelectRef.current(record.id));
        marker.addTo(map);
        markersRef.current.set(record.id, marker);
      });
      if (bounds.length) map.fitBounds(bounds, { padding: [24, 24] });
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
    markersRef.current.forEach((marker, id) => {
      const isSelected = id === selectedId;
      marker.getElement()?.classList.toggle("selected", isSelected);
      marker.setZIndexOffset(isSelected ? 1000 : 0);
    });
  }, [selectedId, records]);

  return <div ref={containerRef} className="location-map-canvas" aria-label="Interactive map of area schools" />;
}

export default LocationMap;
