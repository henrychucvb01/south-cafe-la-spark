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
        const fallbackIcon = L.divIcon({
          className: "location-school-marker-shell location-school-marker-default",
          html: '<span aria-hidden="true"></span>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });
        const schoolIcon = record.school_logo_url
          ? L.icon({
            iconUrl: record.school_logo_url,
            className: "location-school-marker-shell location-school-logo-marker",
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          })
          : fallbackIcon;
        const marker = L.marker(point, {
          icon: schoolIcon,
          keyboard: true,
          title: record.school_name,
        });
        if (record.school_logo_url) {
          marker.on("add", () => {
            marker.getElement()?.addEventListener("error", () => marker.setIcon(fallbackIcon), { once: true });
          });
        }
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
