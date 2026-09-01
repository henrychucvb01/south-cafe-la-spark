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
        const marker = L.circleMarker(point, { radius: 8, weight: 2, color: "#0d638f", fillColor: "#2a91be", fillOpacity: 0.9, keyboard: true });
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
      marker.setStyle({
        radius: isSelected ? 11 : 8,
        weight: isSelected ? 4 : 2,
        color: isSelected ? "#ffffff" : "#0d638f",
        fillColor: isSelected ? "#176f9f" : "#2a91be",
        fillOpacity: 0.95,
      });
      if (isSelected) marker.bringToFront();
    });
  }, [selectedId, records]);

  return <div ref={containerRef} className="location-map-canvas" aria-label="Interactive map of area schools" />;
}

export default LocationMap;
