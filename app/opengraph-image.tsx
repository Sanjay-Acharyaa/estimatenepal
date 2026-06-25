import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Estimate Nepal — Nepal's Smart Construction Platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: 1200,
        height: 630,
        background: "linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 55%, #312e81 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative circles */}
      <div style={{ position: "absolute", top: -100, right: -100, width: 400, height: 400, borderRadius: "50%", background: "rgba(96,165,250,0.12)" }} />
      <div style={{ position: "absolute", bottom: -120, left: -80, width: 350, height: 350, borderRadius: "50%", background: "rgba(99,102,241,0.15)" }} />

      {/* Logo row */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 40 }}>
        <div style={{ width: 64, height: 64, background: "rgba(255,255,255,0.15)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.2)" }}>
          <svg width="38" height="38" viewBox="0 0 40 40" fill="none">
            <rect x="7" y="22" width="6" height="13" rx="1" fill="white" opacity="0.9"/>
            <rect x="17" y="15" width="6" height="20" rx="1" fill="white"/>
            <rect x="27" y="19" width="6" height="16" rx="1" fill="white" opacity="0.85"/>
            <rect x="5" y="36" width="30" height="1.5" rx="0.75" fill="white" opacity="0.4"/>
          </svg>
        </div>
        <span style={{ color: "white", fontSize: 34, fontWeight: 700, letterSpacing: "-0.5px" }}>
          Estimate<span style={{ color: "#93c5fd" }}> Nepal</span>
        </span>
      </div>

      {/* Headline */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 44, textAlign: "center" }}>
        <div style={{ color: "white", fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: "-1.5px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <span>{"Nepal's #1 Construction"}</span>
          <span><span style={{ color: "#93c5fd" }}>Estimating</span> Software</span>
        </div>
        <div style={{ color: "rgba(191,219,254,0.85)", fontSize: 24, fontWeight: 400, letterSpacing: "2.5px", marginTop: 8 }}>
          ESTIMATE · BID · AWARD · BUILD
        </div>
      </div>

      {/* Feature pills */}
      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
        {["BOQ Generation", "DUDBC Rates", "PDF Export", "Team Collaboration"].map((feat) => (
          <div key={feat} style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 100, padding: "10px 22px", color: "rgba(255,255,255,0.9)", fontSize: 17, fontWeight: 500 }}>
            {feat}
          </div>
        ))}
      </div>

      {/* Domain */}
      <div style={{ position: "absolute", bottom: 36, color: "rgba(147,197,253,0.5)", fontSize: 18, fontWeight: 500 }}>
        estimatenepal.com
      </div>
    </div>,
    { width: 1200, height: 630 }
  );
}
