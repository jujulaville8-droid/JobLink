interface JobLinkLogoProps {
  size?: number;
  variant?: "color" | "white";
  className?: string;
}

export default function JobLinkLogo({ size = 28, variant = "color", className = "" }: JobLinkLogoProps) {
  const primary = variant === "white" ? "#ffffff" : "#0d7377";
  const accent = variant === "white" ? "rgba(255,255,255,0.7)" : "#14919b";
  const handle = variant === "white" ? "rgba(255,255,255,0.9)" : "#095355";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      {/* Location pin body */}
      <path
        d="M16 2C10.48 2 6 6.48 6 12c0 7.5 10 18 10 18s10-10.5 10-18c0-5.52-4.48-10-10-10z"
        fill={primary}
        opacity={0.15}
      />
      <path
        d="M16 3C11.03 3 7 7.03 7 12c0 3.2 1.8 7 4.5 10.5 1.8 2.3 3.5 4 4.5 5 1-1 2.7-2.7 4.5-5C23.2 19 25 15.2 25 12c0-4.97-4.03-9-9-9z"
        stroke={primary}
        strokeWidth="1.8"
        fill="none"
      />
      {/* Briefcase inside pin */}
      <rect
        x="10.5"
        y="9.5"
        width="11"
        height="7"
        rx="1.5"
        stroke={primary}
        strokeWidth="1.6"
        fill="none"
      />
      {/* Briefcase handle */}
      <path
        d="M13 9.5V8.5a1.5 1.5 0 011.5-1.5h3A1.5 1.5 0 0119 8.5v1"
        stroke={handle}
        strokeWidth="1.4"
        fill="none"
      />
      {/* Briefcase clasp line */}
      <path
        d="M10.5 12.5h11"
        stroke={primary}
        strokeWidth="1.2"
        opacity={0.4}
      />
      {/* Palm frond accent */}
      <path
        d="M22 5.5c-1.5 1-2.5 2.5-2.8 4"
        stroke={accent}
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M24 4c-1 1.5-1.5 3-1.5 4.5"
        stroke={accent}
        strokeWidth="1.1"
        strokeLinecap="round"
        fill="none"
        opacity={0.6}
      />
    </svg>
  );
}
