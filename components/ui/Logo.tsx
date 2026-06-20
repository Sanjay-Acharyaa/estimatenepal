interface LogoProps {
  variant?: "full" | "icon";
  white?: boolean;
  size?: number;
  className?: string;
  /** Custom logo image URL from admin settings — overrides the built-in SVG */
  src?: string | null;
  /** Custom site name from admin settings */
  name?: string | null;
}

export function Logo({ variant = "full", white = false, size = 36, className = "", src, name }: LogoProps) {
  const siteName = name || "Estimate Nepal";
  const brandName = siteName === "Estimate Nepal"
    ? <><span className={white ? "text-white" : "text-gray-900"}>Estimate</span><span className={white ? "text-blue-300" : "text-blue-600"}> Nepal</span></>
    : <span className={white ? "text-white" : "text-gray-900"}>{siteName}</span>;

  // Custom logo image uploaded by admin — show as <img>
  if (src) {
    if (variant === "icon") {
      return (
        <span className={className} aria-label={siteName}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={siteName} style={{ height: size, width: size, objectFit: "contain" }} />
        </span>
      );
    }
    return (
      <span className={`inline-flex items-center ${className}`} aria-label={siteName}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={siteName} style={{ height: size, objectFit: "contain", maxWidth: size * 5 }} />
      </span>
    );
  }
  const icon = (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect width="40" height="40" rx="10" fill={white ? "rgba(255,255,255,0.15)" : "#1d4ed8"} />
      {/* Building skyline */}
      <rect x="7" y="22" width="6" height="13" rx="1" fill="white" opacity="0.9" />
      <rect x="17" y="15" width="6" height="20" rx="1" fill="white" />
      <rect x="27" y="19" width="6" height="16" rx="1" fill="white" opacity="0.85" />
      {/* Measurement baseline */}
      <rect x="5" y="36" width="30" height="1.5" rx="0.75" fill="white" opacity="0.45" />
      <rect x="10" y="33.5" width="1.5" height="3" rx="0.5" fill="white" opacity="0.35" />
      <rect x="20" y="33.5" width="1.5" height="3" rx="0.5" fill="white" opacity="0.35" />
      <rect x="30" y="33.5" width="1.5" height="3" rx="0.5" fill="white" opacity="0.35" />
    </svg>
  );

  if (variant === "icon") return <span className={className} aria-label={siteName}>{icon}</span>;

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label={siteName}>
      {icon}
      <span className={`font-bold tracking-tight`} style={{ fontSize: size * 0.5 }}>
        {brandName}
      </span>
    </span>
  );
}
