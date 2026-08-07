import type {
  CenterLineMode,
  DesignConfig,
  Project,
  SectionData,
  SurveyPoint,
} from "./types";

/** Convert a chainage value to meters. */
export function toMeters(chainage: number, unit: "KM" | "M"): number {
  return unit === "KM" ? chainage * 1000 : chainage;
}

export function centerLineOf(points: SurveyPoint[], mode: CenterLineMode, manual: number): number {
  if (points.length === 0) return manual;
  if (mode === "MANUAL") return manual;
  if (mode === "MIDDLE") {
    const xs = points.map((p) => p.distance);
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  }
  // LOWEST_EARTH: distance at the minimum RL
  return points.reduce((lo, p) => (p.rl < lo.rl ? p : lo), points[0]!).distance;
}

/** Design (template) profile of a re-sectioned canal about the center line. */
export function designProfile(points: SurveyPoint[], cfg: DesignConfig): SurveyPoint[] {
  const cl = centerLineOf(points, cfg.centerLineMode, cfg.manualCenterLine);
  const half = cfg.bedWidth / 2;
  const xs = points.map((p) => p.distance);
  const left = points.length ? Math.min(...xs) : cl - half - cfg.topWidth;
  const right = points.length ? Math.max(...xs) : cl + half + cfg.topWidth;
  const bankTopRL = topBankLevel(points, cfg);
  const depth = Math.max(bankTopRL - cfg.bedLevel, 0);
  const slopeRun = depth * cfg.sideSlope;

  const raw: Array<[number, number]> = [
    [left, bankTopRL],
    [cl - half - slopeRun, bankTopRL],
    [cl - half, cfg.bedLevel],
    [cl + half, cfg.bedLevel],
    [cl + half + slopeRun, bankTopRL],
    [right, bankTopRL],
  ];

  return raw
    .filter(([x]) => x >= left - 0.001 && x <= right + 0.001)
    .sort((a, b) => a[0] - b[0])
    .map(([distance, rl], i) => ({ id: `d${i}`, distance, rl }));
}

function topBankLevel(points: SurveyPoint[], cfg: DesignConfig): number {
  if (!points.length) return cfg.bedLevel + 2;
  const max = Math.max(...points.map((p) => p.rl));
  return Math.max(max, cfg.bedLevel + 0.5);
}

/** Interpolate an RL on a polyline at a given distance (null outside range). */
export function interpAt(points: SurveyPoint[], x: number): number | null {
  const p = [...points].sort((a, b) => a.distance - b.distance);
  if (p.length < 2 || x < p[0]!.distance || x > p[p.length - 1]!.distance) return null;
  for (let i = 1; i < p.length; i++) {
    const cur = p[i]!;
    const prev = p[i - 1]!;
    if (x <= cur.distance) {
      const t = (x - prev.distance) / (cur.distance - prev.distance || 1);
      return prev.rl + t * (cur.rl - prev.rl);
    }
  }
  return null;
}

/**
 * Area between an existing ground line and the design line.
 * Positive area = cutting (ground above design).
 */
export function sectionArea(ground: SurveyPoint[], design: SurveyPoint[]): number {
  if (ground.length < 2 || design.length < 2) return 0;
  const xs = Array.from(
    new Set([...ground, ...design].map((p) => Number(p.distance.toFixed(4)))),
  ).sort((a, b) => a - b);

  let area = 0;
  for (let i = 1; i < xs.length; i++) {
    const x0 = xs[i - 1]!;
    const x1 = xs[i]!;
    const d0 = diff(ground, design, x0);
    const d1 = diff(ground, design, x1);
    if (d0 === null || d1 === null) continue;
    area += ((d0 + d1) / 2) * (x1 - x0);
  }
  return area;
}

function diff(ground: SurveyPoint[], design: SurveyPoint[], x: number): number | null {
  const g = interpAt(ground, x);
  const d = interpAt(design, x);
  if (g === null || d === null) return null;
  return g - d;
}

export interface SegmentRow {
  fromChainage: number;
  toChainage: number;
  distance: number;
  areaFrom: number;
  areaTo: number;
  meanArea: number;
  volume: number;
  gap: boolean;
}

export interface ChainageAreaRow {
  chainage: number;
  preArea: number;
  postArea: number;
}

/** Mean-area volume computation with gap handling. */
export function computeVolumes(
  sections: SectionData[],
  cfg: DesignConfig,
  maxGapMeters = 200,
): { areas: ChainageAreaRow[]; segments: SegmentRow[]; total: number } {
  const sorted = [...sections].sort((a, b) => a.chainage - b.chainage);
  const areas: ChainageAreaRow[] = sorted.map((s) => ({
    chainage: s.chainage,
    preArea: sectionArea(s.points, designProfile(s.points, cfg)),
    postArea: 0,
  }));

  const segments: SegmentRow[] = [];
  let total = 0;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    const distance =
      toMeters(b.chainage, cfg.chainageUnit) - toMeters(a.chainage, cfg.chainageUnit);
    const areaFrom = areas[i - 1]!.preArea;
    const areaTo = areas[i]!.preArea;
    // Gap: empty section data on either side, or a disconnected (too long) span.
    const gap = a.points.length < 2 || b.points.length < 2 || distance > maxGapMeters;
    const meanArea = gap ? 0 : (areaFrom + areaTo) / 2;
    const volume = gap ? 0 : meanArea * distance;
    total += volume;
    segments.push({
      fromChainage: a.chainage,
      toChainage: b.chainage,
      distance,
      areaFrom,
      areaTo,
      meanArea,
      volume,
      gap,
    });
  }
  return { areas, segments, total };
}

export interface ProjectStats {
  preVolume: number;
  postVolume: number;
  remaining: number;
  progress: number;
  cost: number;
  sections: number;
}

export function projectStats(project: Project): ProjectStats {
  const cfg = project.config;
  const pre = computeVolumes(project.pre, cfg).total;
  const post = computeVolumes(project.post, cfg).total;
  // Executed work = reduction of the remaining cut between pre and post survey.
  const executed = Math.max(pre - post, 0);
  return {
    preVolume: pre,
    postVolume: post,
    remaining: Math.max(post, 0),
    progress: pre > 0 ? Math.min((executed / pre) * 100, 100) : 0,
    cost: executed * cfg.rate,
    sections: project.pre.length,
  };
}

export const fmt = (n: number, d = 2) =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
