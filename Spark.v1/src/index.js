import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// ---------------------------------------------------
// SPARK PWA SERVICE WORKER
// ---------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((registration) => {
        console.log("SPARK service worker registered:", registration.scope);
      })
      .catch((error) => {
        console.error("SPARK service worker registration failed:", error);
      });
  });
}
