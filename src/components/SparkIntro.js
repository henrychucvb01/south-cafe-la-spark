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

    const duration = reduceMotion ? 250 : 2350;

    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(INTRO_KEY, "yes");
      } catch {
        // Storage may be unavailable; the intro can still finish.
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
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #07182d;
      animation: sparkIntroOverlayFade 2.35s ease-in-out forwards;
    }

    .spark-intro-burst {
      position: absolute;
      left: 50%;
      top: 50%;
      width: min(430px, 78vw);
      height: auto;
      transform: translate(-50%, -55%);
      object-fit: contain;
      opacity: 1;
      animation: sparkIntroBurstFade 1.55s ease-out forwards;
    }

    .spark-intro-logo {
      position: relative;
      z-index: 2;
      width: min(180px, 38vw);
      height: auto;
      object-fit: contain;
      opacity: 0;
      transform: scale(0.84);
      filter: drop-shadow(0 10px 28px rgba(0, 0, 0, 0.28));
      animation: sparkIntroLogoReveal 0.85s 1.08s
        cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
    }

    @keyframes sparkIntroBurstFade {
      0% {
        opacity: 1;
        transform: translate(-50%, -55%) scale(0.92);
      }

      72% {
        opacity: 1;
        transform: translate(-50%, -55%) scale(1);
      }

      100% {
        opacity: 0;
        transform: translate(-50%, -55%) scale(1.04);
      }
    }

    @keyframes sparkIntroLogoReveal {
      0% {
        opacity: 0;
        transform: scale(0.84);
      }

      45% {
        opacity: 1;
        transform: scale(1.04);
      }

      100% {
        opacity: 1;
        transform: scale(1);
      }
    }

    @keyframes sparkIntroOverlayFade {
      0%,
      84% {
        opacity: 1;
      }

      100% {
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
      }
    }

    @media (max-width: 600px) {
      .spark-intro-burst {
        width: min(340px, 88vw);
      }

      .spark-intro-logo {
        width: min(150px, 42vw);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .spark-intro-burst {
        display: none;
      }

      .spark-intro-logo {
        opacity: 1;
        transform: none;
        animation: none;
      }

      .spark-intro-overlay {
        animation-duration: 250ms;
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
              src="/spark-burst-navy.gif"
              alt=""
              className="spark-intro-burst"
              aria-hidden="true"
            />

            <img
              src="/spark-clear.png"
              alt="SPARK"
              className="spark-intro-logo"
            />
          </div>
        </>
      )}
    </>
  );
}
