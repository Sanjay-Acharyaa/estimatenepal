export function getSecurityHeaders(): Record<string, string> {
  const storageEndpoint = process.env.STORAGE_ENDPOINT ?? "";
  const connectSrc = ["'self'", storageEndpoint].filter(Boolean).join(" ");
  return {
    "Content-Security-Policy":
      `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src ${connectSrc}; frame-ancestors 'none';`,
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}
