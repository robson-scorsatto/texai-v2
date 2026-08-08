/** Tiny className joiner — no need for a full `clsx` dependency yet. */
export function clsx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
