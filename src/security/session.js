// Keep bearer credentials in memory, never in localStorage or browser URLs.
let token = null;
export function setSparkSession(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('SPARK could not establish a secure session.');
  token = value;
}
export function getSparkSession() { return token; }
export function clearSparkSession() { const previous = token; token = null; return previous; }
export function sessionFetch(url, options = {}) {
  const headers = new Headers(options.headers);
  if (token) headers.set('x-spark-session', token);
  else headers.delete('x-spark-session');
  return fetch(url, { ...options, headers });
}
