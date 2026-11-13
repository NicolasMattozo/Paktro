export function AgexMark({
  size = 26,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient
          id="agex-mark-bg"
          x1="4"
          y1="2"
          x2="36"
          y2="38"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#14182e" />
          <stop offset="1" stopColor="#252c58" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="36" height="36" rx="10" fill="url(#agex-mark-bg)" />
      <rect
        x="2.5"
        y="2.5"
        width="35"
        height="35"
        rx="9.5"
        stroke="#818cf8"
        strokeOpacity="0.35"
      />
      <path
        d="M9.5 28.5C14 31.5 22.5 31 28.5 25"
        stroke="#6366f1"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeOpacity="0.9"
      />
      <path
        d="M12.5 28L19.2 11.5L26 26"
        stroke="#ffffff"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.8 22H28.8M25.2 18.4L29.4 22L25.2 25.6"
        stroke="#a5b4fc"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="29.5"
        cy="11.5"
        r="3.4"
        fill="#10b981"
        stroke="#171c36"
        strokeWidth="1.2"
      />
    </svg>
  );
}

