export type ChainageUnit = "KM" | "M";
export type CenterLineMode = "MANUAL" | "LOWEST_EARTH" | "MIDDLE" | "START_X";
export type WorkType = "CANAL_EXCAVATION" | "EMBANKMENT_RESECTIONING";
/** How the design level / width varies along the alignment. */
export type VaryMode = "CONSTANT" | "INTERPOLATED" | "CONSTANT_AT_FIXED_LENGTH";

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
  /** offset of the centre line within this section (CL Dist., m) */
  clDist?: number;
  points: SurveyPoint[];
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** Dynamic intermediate (middle) chainage control point. */
export interface ControlPoint {
  id: string;
  /** chainage in the project's chainage unit */
  chainage: number;
  /** design bed/crest level at this chainage (optional) */
  level?: number | undefined;
  /** design bed/crest width at this chainage (optional) */
  width?: number | undefined;
}

export interface DesignConfig {
  workType: WorkType;
  chainageUnit: ChainageUnit;
  centerLineMode: CenterLineMode;
  manualCenterLine: number;
  /** country slope (left) as H in H:1V */
  csSlope: number;
  /** river slope (right) as H in H:1V */
  rsSlope: number;

  /** chainage range over which levels/widths are defined */
  startChainage: number;
  endChainage: number;

  levelMode: VaryMode;
  /** design bed (canal) or crest (embankment) level at start chainage, mSOB */
  levelStart: number;
  levelEnd: number;

  widthMode: VaryMode;
  /** design bed / crest width at start chainage, m */
  widthStart: number;
  widthEnd: number;
  /** length (m) of each constant-width step when widthMode = CONSTANT_AT_FIXED_LENGTH */
  fixedLength: number;
  /** dynamic intermediate chainage / level / width control points */
  controlPoints: ControlPoint[];


  /** Post-work options */
  calculateProgress: boolean;

  /** Khal re-excavation: quantify cutting only, ignoring any filling soil */
  cutOnly: boolean;

  /** Colour control (RGB) */
  colorPre: RgbColor;
  colorPostAdjusted: RgbColor;
  colorPostOriginal: RgbColor;
  colorDesign: RgbColor;

  /** rate per m³ */
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
  workType: "EMBANKMENT_RESECTIONING",
  chainageUnit: "KM",
  centerLineMode: "MANUAL",
  manualCenterLine: 17,
  csSlope: 2.5,
  rsSlope: 2.5,
  startChainage: 13.5,
  endChainage: 0.53,
  levelMode: "INTERPOLATED",
  levelStart: 21.32,
  levelEnd: 23.914,
  widthMode: "CONSTANT",
  widthStart: 4.3,
  widthEnd: 4.3,
  fixedLength: 300,
  controlPoints: [],
  calculateProgress: true,
  colorPre: { r: 255, g: 0, b: 0 },
  colorPostAdjusted: { r: 0, g: 255, b: 0 },
  colorPostOriginal: { r: 0, g: 0, b: 255 },
  colorDesign: { r: 150, g: 150, b: 150 },
  rate: 210,
});

/** Merge stored (possibly legacy) configs with the current shape. */
export function normalizeConfig(cfg: Partial<DesignConfig> & Record<string, unknown>): DesignConfig {
  const base = defaultConfig();
  const legacyLevel = typeof cfg["bedLevel"] === "number" ? (cfg["bedLevel"] as number) : undefined;
  const legacyWidth = typeof cfg["bedWidth"] === "number" ? (cfg["bedWidth"] as number) : undefined;
  const legacySlope = typeof cfg["sideSlope"] === "number" ? (cfg["sideSlope"] as number) : undefined;
  return {
    ...base,
    ...cfg,
    workType: (cfg.workType as WorkType) ?? base.workType,
    centerLineMode: (cfg.centerLineMode as CenterLineMode) ?? base.centerLineMode,
    csSlope: cfg.csSlope ?? legacySlope ?? base.csSlope,
    rsSlope: cfg.rsSlope ?? legacySlope ?? base.rsSlope,
    levelStart: cfg.levelStart ?? legacyLevel ?? base.levelStart,
    levelEnd: cfg.levelEnd ?? legacyLevel ?? base.levelEnd,
    widthStart: cfg.widthStart ?? legacyWidth ?? base.widthStart,
    widthEnd: cfg.widthEnd ?? legacyWidth ?? base.widthEnd,
    colorPre: cfg.colorPre ?? base.colorPre,
    colorPostAdjusted: cfg.colorPostAdjusted ?? base.colorPostAdjusted,
    colorPostOriginal: cfg.colorPostOriginal ?? base.colorPostOriginal,
    colorDesign: cfg.colorDesign ?? base.colorDesign,
    controlPoints: Array.isArray(cfg.controlPoints) ? cfg.controlPoints : base.controlPoints,
  } as DesignConfig;
}

export const rgbToHex = ({ r, g, b }: RgbColor) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
