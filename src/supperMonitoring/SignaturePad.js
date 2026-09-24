import { localDate } from "./model";
import React, { useEffect, useRef, useState } from "react";

// Store normalized vectors, not device-size pixels. Resizing/rotating does not
// erase ink; the same accepted strokes can later be embedded in the official PDF.
export default function SignaturePad({ name, value, onChange, disabled = false, label }) {
  const canvas = useRef(null);
  const drawing = useRef(null);
  const strokes = useRef(value?.strokes || []);
  const [hasInk, setHasInk] = useState(strokes.current.length > 0);
  const [date, setDate] = useState(value?.date || localDate());
  const [applyBoth, setApplyBoth] = useState(value?.pages?.length === 2);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  const accepted = !!value && value.printedName === name.trim();

  function paint() {
    const surface = canvas.current;
    if (!surface) return;
    const context = surface.getContext("2d");
    if (!context) return;
    const rect = surface.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    surface.width = Math.max(1, Math.round(rect.width * ratio));
    surface.height = Math.max(1, Math.round(rect.height * ratio));
    context.scale(ratio, ratio);
    context.strokeStyle = "#142d4e";
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    for (const stroke of strokes.current) {
      context.beginPath();
      stroke.forEach(([x, y], i) => i ? context.lineTo(x * rect.width, y * rect.height) : context.moveTo(x * rect.width, y * rect.height));
      context.stroke();
    }
  }
  useEffect(() => {
    paint();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(paint);
    if (canvas.current) observer?.observe(canvas.current);
    window.addEventListener("resize", paint);
    return () => { observer?.disconnect(); window.removeEventListener("resize", paint); };
  }, [expanded, accepted]);
  function point(event) {
    const rect = canvas.current.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))];
  }
  function start(event) {
    if (disabled || accepted || (event.pointerType === "mouse" && event.button !== 0) || drawing.current !== null) return;
    if (strokes.current.length >= 80) { setMessage("Signature area is full. Accept or clear the signature."); return; }
    event.preventDefault();
    drawing.current = event.pointerId;
    canvas.current.setPointerCapture(event.pointerId);
    strokes.current = [...strokes.current, [point(event)]];
    setMessage("");
  }
  function move(event) {
    if (drawing.current !== event.pointerId || disabled || accepted) return;
    const stroke = strokes.current[strokes.current.length - 1];
    if (stroke.length >= 1500 || strokes.current.reduce((total, line) => total + line.length, 0) >= 4000) { setMessage("Signature area is full. Accept or clear the signature."); return; }
    stroke.push(point(event));
    setHasInk(strokes.current.some(stroke => stroke.length > 1));
    paint();
  }
  function end(event) {
    if (drawing.current !== event.pointerId) return;
    drawing.current = null;
    if (canvas.current.hasPointerCapture(event.pointerId)) canvas.current.releasePointerCapture(event.pointerId);
  }
  function clear() {
    strokes.current = []; drawing.current = null; setHasInk(false); setMessage(""); onChange(null); paint();
  }
  function accept() {
    if (!name.trim() || !date || !hasInk || !applyBoth) { setMessage("Confirm your printed name, draw a signature, enter its date, and select both pages before accepting."); return; }
    const rect = canvas.current.getBoundingClientRect();
    onChange({ strokes: strokes.current.map(stroke => stroke.map(point => [...point])), aspectRatio: rect.width / rect.height, printedName: name.trim(), date, pages: [1, 2], acceptedAt: new Date().toISOString(), method: "this-device" });
    setMessage("");
  }
  return <div className="sm-signature">
    {!accepted && !disabled && <button type="button" className="sm-primary" aria-expanded={expanded} onClick={() => setExpanded(true)}>Sign with Finger</button>}
    {(expanded || accepted) && <>
    <p>{accepted ? "Your signature will appear in your signature spaces on both PDF pages." : "Use your finger to sign in the box below, or use a mouse on a computer. Your signature will be copied into your signature spaces on both PDF pages."}</p>
    <canvas ref={canvas} className="sm-signature-canvas" aria-label={`${label} signature drawing area`} onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => { drawing.current = null; }} />
    <label>Signature date<input type="date" value={date} disabled={disabled || accepted} onChange={e => setDate(e.target.value)} /></label>
    <label className="sm-check"><input type="checkbox" checked={applyBoth} disabled={disabled || accepted} onChange={e => setApplyBoth(e.target.checked)} />I authorize this signature to be applied to the required {label} signature locations on both official pages.</label>
    {accepted && <p role="status">✓ Signature Complete — Signature accepted for both pages — {value.date}</p>}
    {message && <p className="sm-error" role="alert">{message}</p>}
    {!disabled && <div className="sm-actions"><button type="button" onClick={clear}>Clear</button><button type="button" onClick={accept} disabled={accepted || !hasInk}>Accept Signature</button></div>}
    </>}
    {disabled && !accepted && <p>No accepted signature.</p>}
  </div>;
}
