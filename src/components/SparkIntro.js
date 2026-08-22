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

    // GIF is about 1.28 seconds.
    // Then the SPARK icon holds briefly before the intro fades away.
    const duration = reduceMotion ? 250 : 2350;

    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(INTRO_KEY, "yes");
      } catch {
        // Continue even when browser storage is unavailable.
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
          <img
            src="/spark-burst-navy.gif"
            alt=""
            className="spark-launch-burst"
            aria-hidden="true"
          />

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
