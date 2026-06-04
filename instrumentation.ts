export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      debug: false,
      enabled: !!process.env.SENTRY_DSN,
    });

    // Konva calls `new DOMMatrix()` at module-init time — browser API not in Node.
    // DrawingCanvas is ssr:false so it's never rendered server-side, but the module
    // is still evaluated in the SSR bundle, causing a ReferenceError without this stub.
    if (typeof (globalThis as any).DOMMatrix === "undefined") {
      (globalThis as any).DOMMatrix = class DOMMatrix {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
        m11 = 1; m12 = 0; m13 = 0; m14 = 0;
        m21 = 0; m22 = 1; m23 = 0; m24 = 0;
        m31 = 0; m32 = 0; m33 = 1; m34 = 0;
        m41 = 0; m42 = 0; m43 = 0; m44 = 1;
        is2D = true; isIdentity = true;
        static fromMatrix() { return new (globalThis as any).DOMMatrix(); }
        static fromFloat32Array() { return new (globalThis as any).DOMMatrix(); }
        static fromFloat64Array() { return new (globalThis as any).DOMMatrix(); }
        multiply() { return new (globalThis as any).DOMMatrix(); }
        translate() { return new (globalThis as any).DOMMatrix(); }
        scale() { return new (globalThis as any).DOMMatrix(); }
        rotate() { return new (globalThis as any).DOMMatrix(); }
        inverse() { return new (globalThis as any).DOMMatrix(); }
        flipX() { return new (globalThis as any).DOMMatrix(); }
        flipY() { return new (globalThis as any).DOMMatrix(); }
      };
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      debug: false,
      enabled: !!process.env.SENTRY_DSN,
    });
  }
}
