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

    const duration = reduceMotion ? 300 : 3600;

    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(INTRO_KEY, "yes");
      } catch {
        // Intro still closes if browser storage is unavailable.
      }

      setShowIntro(false);
    }, duration);

    return () => window.clearTimeout(timer);
  }, [showIntro]);

  const css = `
    .spark-intro-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      overflow: hidden;
      background: #07182d;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: sparkOverlayExit 3.6s ease-in-out forwards;
    }

    .spark-intro-burst {
      position: absolute;
      left: 50%;
      top: 50%;
      width: min(430px, 82vw);
      height: auto;
      transform: translate(-50%, -52%);
      object-fit: contain;
      z-index: 1;
      animation: sparkBurstSequence 1.45s ease-out forwards;
    }

    .spark-intro-cover {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      opacity: 0;
      z-index: 2;
      animation: sparkCoverReveal 2.15s 1.15s ease-in-out forwards;
    }

    @keyframes sparkBurstSequence {
      0% {
        opacity: 1;
        transform: translate(-50%, -52%) scale(0.94);
      }

      70% {
        opacity: 1;
        transform: translate(-50%, -52%) scale(1);
      }

      100% {
        opacity: 0;
        transform: translate(-50%, -52%) scale(1.05);
      }
    }

    @keyframes sparkCoverReveal {
      0% {
        opacity: 0;
        transform: scale(1.02);
      }

      18% {
        opacity: 1;
        transform: scale(1);
      }

      82% {
        opacity: 1;
        transform: scale(1);
      }

      100% {
        opacity: 1;
        transform: scale(1);
      }
    }

    @keyframes sparkOverlayExit {
      0%,
      88% {
        opacity: 1;
      }

      100% {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }
    }

    @media (max-width: 700px) {
      .spark-intro-burst {
        width: min(360px, 88vw);
      }

      .spark-intro-cover {
        object-fit: contain;
        background: #07182d;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .spark-intro-burst {
        display: none;
      }

      .spark-intro-cover {
        opacity: 1;
        animation: none;
        object-fit: contain;
        background: #07182d;
      }

      .spark-intro-overlay {
        animation-duration: 300ms;
      }
    }
  `;

  return (
    <>
      {children}

      {showIntro && (
        <>
          <style>{css}</style>

          <div className="spark-intro-overlay" aria-label="Opening SPARK">
            <img
             src={`/spark-burst-navy.gif?play=${Date.now()}`}
              alt=""
              className="spark-intro-burst"
              aria-hidden="true"
            />

            <img
              src="/spark-cover-art.png"
              alt="SPARK"
              className="spark-intro-cover"
            />
          </div>
        </>
      )}
    </>
  );
}
