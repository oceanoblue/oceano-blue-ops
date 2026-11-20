import { initials } from "@/lib/social/schema";

export type LogoSize = "sm" | "md" | "lg" | "xl";

const BOX: Record<LogoSize, string> = {
  sm: "h-8 w-8 rounded-lg text-[11px]",
  md: "h-11 w-11 rounded-xl text-sm",
  lg: "h-16 w-16 rounded-2xl text-xl",
  xl: "h-20 w-20 rounded-2xl text-2xl sm:h-24 sm:w-24 sm:text-3xl",
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
 * brand-colored tile when no logo has been added yet.
 */
export function SocialLogo({ name, url, size = "md", className = "" }: { name: string; url?: string | null; size?: LogoSize; className?: string }) {
  if (url)
    return (
      <span className={`grid shrink-0 place-items-center overflow-hidden bg-white shadow-soft ring-1 ring-ink-200/80 ${BOX[size]} ${PAD[size]} ${className}`}>
        {/* A plain image: logos are small, already resized on upload, and come from our own storage. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`${name} logo`} className="max-h-full max-w-full object-contain" decoding="async" />
      </span>
    );
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center bg-linear-to-br font-display font-semibold tracking-tight text-white shadow-soft ${tone(name)} ${BOX[size]} ${className}`}
    >
      {initials(name)}
    </span>
  );
}
