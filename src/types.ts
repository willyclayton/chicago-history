export type CategoryId = "growth" | "dark" | "rights" | "building" | "culture" | "play" | "fairs";

export interface Source {
  title: string;
  url: string;
}

export interface Site {
  id: string;
  year: number;
  date: string;
  title: string;
  short: string;
  category: CategoryId;
  lat: number;
  lng: number;
  address: string;
  story: string;
  today: string;
  flagStar?: boolean;
  streetView?: boolean;
  svHeading?: number;
  svPitch?: number;
  sources: Source[];
}

export interface Category {
  id: CategoryId;
  name: string;
  colorLight: string;
  colorDark: string;
}

export interface Era {
  from: number;
  to: number;
  name: string;
}

export interface CensusCount {
  year: number;
  population: number;
}
