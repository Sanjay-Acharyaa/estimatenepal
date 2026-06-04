export function getSecurityHeaders(): Record<string, string> {
  const storageEndpoint = process.env.STORAGE_ENDPOINT ?? "";
  // Include storage endpoint for pre-signed upload/download URLs
  const connectSrc = ["'self'", "ws:", "wss:", storageEndpoint].filter(Boolean).join(" ");
  // img-src includes storage endpoint for drawing thumbnails
  const imgSrc = ["'self'", "data:", "blob:", storageEndpoint].filter(Boolean).join(" ");

  // Note: 'unsafe-eval' is required by PDF.js (uses eval() for its JS engine internally).
  // 'unsafe-inline' is required by Next.js (injects inline scripts for hydration).
  // A nonce-based CSP would remove both but requires significant Next.js configuration.
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${imgSrc}`,
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    "worker-src blob: 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  return {
    "Content-Security-Policy": csp,
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-DNS-Prefetch-Control": "off",
  };
}
