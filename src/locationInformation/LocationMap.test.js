import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import LocationMap from "./LocationMap";

const mockMarkers = [];
const mockMapInstance = {
  fitBounds: () => {},
  remove: () => {},
  setView: () => mockMapInstance,
};

jest.mock("leaflet", () => ({
  map: () => mockMapInstance,
  tileLayer: () => ({ addTo: jest.fn() }),
  circleMarker: () => {
    const marker = {
      addTo: jest.fn(),
      bringToFront: jest.fn(),
      on: jest.fn((event, callback) => {
        marker.events[event] = callback;
      }),
      setStyle: jest.fn(),
      events: {},
    };
    mockMarkers.push(marker);
    return marker;
  },
}));

describe("LocationMap", () => {
  let container;
  let root;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    mockMarkers.length = 0;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  it("selects a school from its marker without creating a popup", () => {
    const onSelect = jest.fn();
    const records = [
      { id: "first", school_name: "First School", latitude: 33.7, longitude: -118.2 },
      { id: "second", school_name: "Second School", latitude: 33.8, longitude: -118.3 },
    ];

    act(() => root.render(<LocationMap records={records} selectedId="first" onSelect={onSelect} />));
    act(() => mockMarkers[1].events.click());

    expect(onSelect).toHaveBeenCalledWith("second");
    expect(mockMarkers).toHaveLength(2);
    expect(mockMarkers.every((marker) => marker.bindPopup === undefined)).toBe(true);
  });
});
