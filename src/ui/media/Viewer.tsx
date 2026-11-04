import { useStore } from "../../state/store";

/**
 * Full-screen photo viewer, shown when store.viewer is set (actions.openViewer).
 * Placeholder: the media UI replaces this. Loaded lazily from App.tsx.
 */
export default function Viewer() {
  const viewer = useStore((s) => s.viewer);
  if (!viewer) return null;
  return null;
}
