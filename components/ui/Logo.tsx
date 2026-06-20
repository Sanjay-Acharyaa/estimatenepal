interface LogoProps {
  variant?: "full" | "icon";
  white?: boolean;
  size?: number;
  className?: string;
}

export function Logo({ variant = "full", white = false, size = 36, className = "" }: LogoProps) {
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

  if (variant === "icon") return <span className={className} aria-label="NepaliEstimate">{icon}</span>;

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label="NepaliEstimate">
      {icon}
      <span className={`font-bold tracking-tight ${white ? "text-white" : "text-gray-900"}`} style={{ fontSize: size * 0.5 }}>
        Nepali<span className={white ? "text-blue-300" : "text-blue-600"}>Estimate</span>
      </span>
    </span>
  );
}
