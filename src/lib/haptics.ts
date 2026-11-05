/**
 * A short buzz on phones for the moments that matter (opening a story or a photo).
 * Only on touch screens that support it, after the user has interacted, and never
 * when reduced motion is asked for.
 */
export function haptic(ms = 8) {
  try {
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(hover: none)").matches) return;
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
    if (ua && !ua.hasBeenActive) return;
    navigator.vibrate(ms);
  } catch {
    /* not supported here */
  }
}
