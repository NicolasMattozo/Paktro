const INK = "#0B0D1A";
const LIME = "#C6F24E";
const INDIGO = "#5B5BF0";
const WHITE = "#FFFFFF";
const MUTED_LIGHT = "#ECEEF5";
const MUTED_MID = "#DCE0EC";

/**
 * Agex "Pack Bot": isometric cube whose three faces stand for the agent,
 * rules and skills of a pack, with eyes on the front face.
 */
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
      <rect width="40" height="40" rx="11" fill={INK} />
      <rect
        x="0.5"
        y="0.5"
        width="39"
        height="39"
        rx="10.5"
        stroke={WHITE}
        strokeOpacity="0.1"
      />
      <g transform="translate(20 20) scale(0.84) translate(-20 -20)">
        <g stroke={INK} strokeWidth="1.2" strokeLinejoin="round">
          <path d="M20 6.5L31.7 13.25L20 20L8.3 13.25Z" fill={LIME} />
          <path d="M8.3 13.25L20 20V33.5L8.3 26.75Z" fill={WHITE} />
          <path d="M20 20L31.7 13.25V26.75L20 33.5Z" fill={INDIGO} />
        </g>
        <circle cx="12.5" cy="21.3" r="1.55" fill={INK} />
        <circle cx="16.3" cy="23.5" r="1.55" fill={INK} />
      </g>
    </svg>
  );
}

/**
 * Bare isometric pack cube for cards, hero assembly, and wireframe empty states.
 */
export function PackCube({
  size = 32,
  variant = "pack",
  hasRules = true,
  hasSkills = true,
  eyes = true,
  seam = INK,
  className,
}: {
  size?: number;
  variant?: "pack" | "outline";
  hasRules?: boolean;
  hasSkills?: boolean;
  eyes?: boolean;
  seam?: string;
  className?: string;
}) {
  if (variant === "outline") {
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
        <path
          d="M20 6.5L31.7 13.25V26.75L20 33.5L8.3 26.75V13.25Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path
          d="M8.3 13.25L20 20L31.7 13.25M20 20V33.5"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

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
      <g stroke={seam} strokeWidth="1.15" strokeLinejoin="round">
        <path
          d="M20 6.5L31.7 13.25L20 20L8.3 13.25Z"
          fill={hasSkills ? LIME : MUTED_LIGHT}
        />
        <path d="M8.3 13.25L20 20V33.5L8.3 26.75Z" fill={WHITE} />
        <path
          d="M20 20L31.7 13.25V26.75L20 33.5Z"
          fill={hasRules ? INDIGO : MUTED_MID}
        />
      </g>
      {eyes && (
        <>
          <circle cx="12.5" cy="21.3" r="1.5" fill={INK} />
          <circle cx="16.3" cy="23.5" r="1.5" fill={INK} />
        </>
      )}
    </svg>
  );
}

/**
 * Sequential lighting cube loader for initial workspace hydration.
 */
export function PackLoader({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="pack-loader"
    >
      <rect width="40" height="40" rx="11" fill={INK} />
      <g transform="translate(20 20) scale(0.84) translate(-20 -20)">
        <g stroke={INK} strokeWidth="1.2" strokeLinejoin="round">
          <path
            className="pack-face-top"
            d="M20 6.5L31.7 13.25L20 20L8.3 13.25Z"
            fill={LIME}
          />
          <path
            className="pack-face-left"
            d="M8.3 13.25L20 20V33.5L8.3 26.75Z"
            fill={WHITE}
          />
          <path
            className="pack-face-right"
            d="M20 20L31.7 13.25V26.75L20 33.5Z"
            fill={INDIGO}
          />
        </g>
        <circle className="pack-eyes" cx="12.5" cy="21.3" r="1.55" fill={INK} />
        <circle className="pack-eyes" cx="16.3" cy="23.5" r="1.55" fill={INK} />
      </g>
    </svg>
  );
}
