export function cleanManagerPin(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 4);
}

export function shouldAutoVerifyManagerPin({ pin, mode, submitting }) {
  return cleanManagerPin(pin).length === 4 && !submitting && ["verify", "verify-covering"].includes(mode);
}
