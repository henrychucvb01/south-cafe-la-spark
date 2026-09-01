import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ListingThumbnail, SchoolPhoto } from "./LocationInformationPage";

describe("Location Information media fallbacks", () => {
  let container;
  let root;

  beforeEach(() => {
    global.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the school-photo placeholder when Photo 1 is missing or broken", () => {
    act(() => root.render(<SchoolPhoto record={{ school_name: "Test School", school_photo_url: "https://example.com/broken.webp" }} />));
    act(() => container.querySelector("img").dispatchEvent(new Event("error", { bubbles: true })));
    expect(container.textContent).toContain("School photo coming soon");
  });

  it("uses the school logo when the manager photo is missing", () => {
    act(() => root.render(<ListingThumbnail record={{ school_name: "Test School", manager_photo_url: null, school_logo_url: "https://example.com/logo.webp" }} />));
    expect(container.querySelector("img").src).toBe("https://example.com/logo.webp");
    expect(container.querySelector(".location-map-thumbnail").classList.contains("logo")).toBe(true);
  });

  it("falls from a broken manager photo to the logo, then to a neutral fallback", () => {
    act(() => root.render(<ListingThumbnail record={{ school_name: "Test School", manager_photo_url: "https://example.com/manager.webp", school_logo_url: "https://example.com/logo.webp" }} />));
    act(() => container.querySelector("img").dispatchEvent(new Event("error", { bubbles: true })));
    expect(container.querySelector("img").src).toBe("https://example.com/logo.webp");
    act(() => container.querySelector("img").dispatchEvent(new Event("error", { bubbles: true })));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".fallback")).not.toBeNull();
  });
});
