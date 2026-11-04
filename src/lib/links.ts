import type { Site } from "../types";

export const streetViewLink = (s: Site) =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${s.lat},${s.lng}`;

export const mapsLink = (s: Site) => `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`;

export function streetViewEmbed(s: Site, key: string | undefined): string | null {
  if (!key || s.streetView === false) return null;
  let url = `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(key)}&location=${s.lat},${s.lng}`;
  if (s.svHeading != null) url += `&heading=${s.svHeading}`;
  if (s.svPitch != null) url += `&pitch=${s.svPitch}`;
  return url;
}
