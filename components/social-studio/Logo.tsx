import { initials } from "@/lib/social/schema";

export type LogoSize = "sm" | "md" | "lg" | "xl";

const SHAPE: Record<LogoSize, string> = {
  sm: "rounded-lg text-[11px]",
  md: "rounded-xl text-sm",
  lg: "rounded-2xl text-xl",
  xl: "rounded-2xl text-2xl sm:text-3xl",
};
/** The lettered tile is always square. */
const SQUARE: Record<LogoSize, string> = {
  sm: "h-8 w-8",
  md: "h-11 w-11",
  lg: "h-16 w-16",
  xl: "h-20 w-20 sm:h-24 sm:w-24",
};
/**
 * A logo tile keeps the same height and is at least square, but grows wider
 * for a wide logo (a wordmark), up to a limit, so the name in it stays readable.
 */
const FIT: Record<LogoSize, string> = {
  sm: "h-8 min-w-8 max-w-20",
  md: "h-11 min-w-11 max-w-28",
  lg: "h-16 min-w-16 max-w-40",
  xl: "h-20 min-w-20 max-w-52 sm:h-24 sm:min-w-24 sm:max-w-60",
};
const PAD: Record<LogoSize, string> = { sm: "p-1", md: "p-1.5", lg: "p-2", xl: "p-2.5" };

/** Backgrounds for the lettered tile shown until a logo is added. All within the brand's blues. */
const TONES = [
  "from-ocean-500 to-ocean-700",
  "from-ink-700 to-ink-950",
  "from-ocean-700 to-ocean-950",
  "from-sky-500 to-ocean-700",
  "from-ink-600 to-ocean-900",
];
/** The same name always gets the same tile, so a sub-account is recognizable before it has a logo. */
function tone(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return TONES[hash % TONES.length];
}

/**
 * A client's or sub-account's logo on a white tile, or its initials on a
 * brand-colored tile when no logo has been added yet. A wide logo gets a
 * wider tile; the logo itself is never stretched or cropped.
 */
export function SocialLogo({ name, url, size = "md", className = "" }: { name: string; url?: string | null; size?: LogoSize; className?: string }) {
  if (url)
    return (
      <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden bg-white shadow-soft ring-1 ring-ink-200/80 ${FIT[size]} ${SHAPE[size]} ${PAD[size]} ${className}`}>
        {/* A plain image: logos are small, already resized on upload, and come from our own storage. */}
        {/* The image fills the tile's height and is fitted inside it, so its proportions never change. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`${name} logo`} className="block h-full w-auto max-w-full object-contain" decoding="async" />
      </span>
    );
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center bg-linear-to-br font-display font-semibold tracking-tight text-white shadow-soft ${tone(name)} ${SQUARE[size]} ${SHAPE[size]} ${className}`}
    >
      {initials(name)}
    </span>
  );
}
