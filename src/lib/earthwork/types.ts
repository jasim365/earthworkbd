export type ChainageUnit = "KM" | "M";
export type CenterLineMode = "MANUAL" | "LOWEST_EARTH" | "MIDDLE";

export interface SurveyPoint {
  id: string;
  /** distance from left offset, in meters */
  distance: number;
  /** reduced level, in meters */
  rl: number;
}

export interface SectionData {
  id: string;
  /** chainage value in the project's chainage unit */
  chainage: number;
  points: SurveyPoint[];
}

export interface DesignConfig {
  projectType: "RE_SECTIONING";
  chainageUnit: ChainageUnit;
  centerLineMode: CenterLineMode;
  manualCenterLine: number;
  bedLevel: number;
  bedWidth: number;
  sideSlope: number;
  topWidth: number;
  rate: number;
}

export interface Project {
  id: string;
  name: string;
  location: string;
  createdAt: string;
  config: DesignConfig;
  pre: SectionData[];
  post: SectionData[];
}

export const defaultConfig = (): DesignConfig => ({
  projectType: "RE_SECTIONING",
  chainageUnit: "KM",
  centerLineMode: "MIDDLE",
  manualCenterLine: 0,
  bedLevel: 10,
  bedWidth: 12,
  sideSlope: 1.5,
  topWidth: 3,
  rate: 210,
});
