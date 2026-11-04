/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_EMBED_KEY?: string;
}
declare module "*.geojson" {
  const value: GeoJSON.FeatureCollection;
  export default value;
}
