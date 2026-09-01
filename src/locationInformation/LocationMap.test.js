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
  divIcon: (options) => options,
  icon: (options) => options,
  marker: (_point, options) => {
    const marker = {
      addTo: jest.fn(),
      element: global.document.createElement(options.icon.iconUrl ? "img" : "div"),
      getElement: jest.fn(() => marker.element),
      on: jest.fn((event, callback) => {
        marker.events[event] = callback;
      }),
      options,
      setIcon: jest.fn(),
      setZIndexOffset: jest.fn(),
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
      { id: "first", school_name: "First School", latitude: 33.7, longitude: -118.2, school_logo_url: "https://example.com/logo.webp" },
      { id: "second", school_name: "Second School", latitude: 33.8, longitude: -118.3 },
    ];

    act(() => root.render(<LocationMap records={records} selectedId="first" onSelect={onSelect} />));
    act(() => mockMarkers[1].events.click());

    expect(onSelect).toHaveBeenCalledWith("second");
    expect(mockMarkers).toHaveLength(2);
    expect(mockMarkers.every((marker) => marker.bindPopup === undefined)).toBe(true);
    expect(mockMarkers[0].options.icon.iconUrl).toBe("https://example.com/logo.webp");
    expect(mockMarkers[0].options.icon.iconSize).toEqual([22, 22]);
    expect(mockMarkers[1].options.icon.className).toContain("location-school-marker-default");
  });

  it("falls back to the default marker when a school logo fails", () => {
    act(() => root.render(<LocationMap records={[{ id: "broken", school_name: "Broken Logo", latitude: 33.7, longitude: -118.2, school_logo_url: "https://example.com/broken.webp" }]} selectedId="broken" onSelect={jest.fn()} />));
    act(() => mockMarkers[0].events.add());
    act(() => mockMarkers[0].element.dispatchEvent(new Event("error")));
    expect(mockMarkers[0].setIcon).toHaveBeenCalledWith(expect.objectContaining({
      className: expect.stringContaining("location-school-marker-default"),
      iconSize: [22, 22],
    }));
  });
});
