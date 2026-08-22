import React, { useEffect, useState } from "react";

const INTRO_KEY = "sparkIntroPlayed";

export default function SparkIntro({ children }) {
  const [showIntro, setShowIntro] = useState(() => {
    try {
      return sessionStorage.getItem(INTRO_KEY) !== "yes";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!showIntro) return;

    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    )?.matches;

    const duration = reduceMotion ? 250 : 1650;

    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(INTRO_KEY, "yes");
      } catch {
        // The intro can still finish even when storage is unavailable.
      }
      setShowIntro(false);
    }, duration);

    return () => window.clearTimeout(timer);
  }, [showIntro]);

  return (
    <>
      {children}
      {showIntro && (
        <div className="spark-launch-intro" aria-label="Opening SPARK">
          <div className="spark-launch-light" aria-hidden="true" />
          <img
            src="/spark-clear.png"
            alt="SPARK"
            className="spark-launch-logo"
          />
        </div>
      )}
    </>
  );
}
