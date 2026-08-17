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

export function centerLineOf(
  points: SurveyPoint[],
  mode: CenterLineMode,
  manual: number,
  override?: number,
): number {
  // Only a MANUAL centre line honours a stored per-section override; every other
  // mode re-derives the alignment from the current pre-work RLs on each render.
  if (mode === "MANUAL" && typeof override === "number" && Number.isFinite(override)) return override;
  if (points.length === 0) return manual;
  const xs = points.map((p) => p.distance);
  if (mode === "MANUAL") return manual;
  if (mode === "MIDDLE") return (Math.min(...xs) + Math.max(...xs)) / 2;
  if (mode === "START_X") return Math.min(...xs);
  // LOWEST_EARTH: offset at the minimum RL (minimises overall earthwork)
  return points.reduce((lo, p) => (p.rl < lo.rl ? p : lo), points[0]!).distance;
}

/** Linear interpolation factor of a chainage within the configured range. */
function chainageT(chainage: number, cfg: DesignConfig): number {
  const a = cfg.startChainage;
  const b = cfg.endChainage;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return 0;
  const t = (chainage - a) / (b - a);
  return Math.max(0, Math.min(1, t));
}

/**
 * Piecewise-linear interpolation through the start value, any dynamic middle
 * control points that define this quantity, and the end value.
 */
function seriesValue(
  chainage: number,
  cfg: DesignConfig,
  key: "level" | "width",
  startVal: number,
  endVal: number,
): number | null {
  const mids = (cfg.controlPoints ?? [])
    .filter((c) => typeof c[key] === "number" && Number.isFinite(c[key] as number))
    .map((c) => ({ t: chainageT(c.chainage, cfg), v: c[key] as number }));
  if (mids.length === 0) return null;
  const pts = [{ t: 0, v: startVal }, ...mids, { t: 1, v: endVal }].sort((a, b) => a.t - b.t);
  const t = chainageT(chainage, cfg);
  if (t <= pts[0]!.t) return pts[0]!.v;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (t <= b.t) {
      const k = (t - a.t) / (b.t - a.t || 1);
      return a.v + k * (b.v - a.v);
    }
  }
  return pts[pts.length - 1]!.v;
}

/** Design bed / crest level at a chainage. */
export function designLevelAt(chainage: number, cfg: DesignConfig): number {
  const mid = seriesValue(chainage, cfg, "level", cfg.levelStart, cfg.levelEnd);
  if (mid !== null && cfg.levelMode !== "CONSTANT_AT_FIXED_LENGTH") return mid;
  if (cfg.levelMode === "CONSTANT") return cfg.levelStart;
  if (cfg.levelMode === "CONSTANT_AT_FIXED_LENGTH") {
    const step = Math.max(cfg.fixedLength, 1);
    const dist = Math.abs(toMeters(chainage, cfg.chainageUnit) - toMeters(cfg.startChainage, cfg.chainageUnit));
    const span = Math.abs(
      toMeters(cfg.endChainage, cfg.chainageUnit) - toMeters(cfg.startChainage, cfg.chainageUnit),
    );
    const steps = Math.max(Math.floor(span / step), 1);
    const t = Math.min(Math.floor(dist / step) / steps, 1);
    return cfg.levelStart + (cfg.levelEnd - cfg.levelStart) * t;
  }
  return cfg.levelStart + (cfg.levelEnd - cfg.levelStart) * chainageT(chainage, cfg);
}

/** Design bed / crest width at a chainage. */
export function designWidthAt(chainage: number, cfg: DesignConfig): number {
  const mid = seriesValue(chainage, cfg, "width", cfg.widthStart, cfg.widthEnd);
  if (mid !== null && cfg.widthMode !== "CONSTANT_AT_FIXED_LENGTH") return mid;
  if (cfg.widthMode === "CONSTANT") return cfg.widthStart;
  if (cfg.widthMode === "CONSTANT_AT_FIXED_LENGTH") {
    const step = Math.max(cfg.fixedLength, 1);
    const dist = Math.abs(toMeters(chainage, cfg.chainageUnit) - toMeters(cfg.startChainage, cfg.chainageUnit));
    const span = Math.abs(
      toMeters(cfg.endChainage, cfg.chainageUnit) - toMeters(cfg.startChainage, cfg.chainageUnit),
    );
    const steps = Math.max(Math.floor(span / step), 1);
    const t = Math.min(Math.floor(dist / step) / steps, 1);
    return cfg.widthStart + (cfg.widthEnd - cfg.widthStart) * t;
  }
  return cfg.widthStart + (cfg.widthEnd - cfg.widthStart) * chainageT(chainage, cfg);
}

/**
 * Design (template) profile for a section: trapezoidal prism about the centre line.
 * Canal excavation opens downwards (side slopes rise outwards from the bed),
 * embankment re-sectioning is a crest with slopes falling outwards.
 */
export function designProfile(section: SectionData, cfg: DesignConfig): SurveyPoint[] {
  const points = section.points;
  const cl = centerLineOf(points, cfg.centerLineMode, cfg.manualCenterLine, section.clDist);
  const level = designLevelAt(section.chainage, cfg);
  const half = designWidthAt(section.chainage, cfg) / 2;
  const xs = points.map((p) => p.distance);
  const left = points.length ? Math.min(...xs) : cl - half - 10;
  const right = points.length ? Math.max(...xs) : cl + half + 10;

  const rls = points.map((p) => p.rl);
  const maxGround = points.length ? Math.max(...rls) : level + 2;
  const minGround = points.length ? Math.min(...rls) : level - 2;

  const embankment = cfg.workType === "EMBANKMENT_RESECTIONING";
  const height = embankment ? Math.max(level - minGround, 0.5) : Math.max(maxGround - level, 0.5);
  const leftRun = height * cfg.csSlope;
  const rightRun = height * cfg.rsSlope;
  const outerRL = embankment ? level - height : level + height;

  const raw: Array<[number, number]> = [
    [Math.min(left, cl - half - leftRun), outerRL],
    [cl - half - leftRun, outerRL],
    [cl - half, level],
    [cl + half, level],
    [cl + half + rightRun, outerRL],
    [Math.max(right, cl + half + rightRun), outerRL],
  ];

  return raw
    .sort((a, b) => a[0] - b[0])
    .map(([distance, rl], i) => ({ id: `d${i}`, distance, rl }));
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

export interface AreaResult {
  /** excavation area, m² (ground above design) */
  cut: number;
  /** embankment area, m² (design above ground) */
  fill: number;
  /** cut − fill */
  net: number;
}

/** Cut / fill areas between an existing ground line and the design line. */
export function sectionAreas(ground: SurveyPoint[], design: SurveyPoint[]): AreaResult {
  if (ground.length < 2 || design.length < 2) return { cut: 0, fill: 0, net: 0 };
  const xs = Array.from(
    new Set([...ground, ...design].map((p) => Number(p.distance.toFixed(4)))),
  ).sort((a, b) => a - b);

  let cut = 0;
  let fill = 0;
  for (let i = 1; i < xs.length; i++) {
    const x0 = xs[i - 1]!;
    const x1 = xs[i]!;
    const d0 = diff(ground, design, x0);
    const d1 = diff(ground, design, x1);
    if (d0 === null || d1 === null) continue;
    const w = x1 - x0;
    if (d0 >= 0 && d1 >= 0) cut += ((d0 + d1) / 2) * w;
    else if (d0 <= 0 && d1 <= 0) fill += ((-d0 - d1) / 2) * w;
    else {
      // crossing point
      const t = d0 / (d0 - d1);
      const xa = w * t;
      const first = (Math.abs(d0) / 2) * xa;
      const second = (Math.abs(d1) / 2) * (w - xa);
      if (d0 > 0) {
        cut += first;
        fill += second;
      } else {
        fill += first;
        cut += second;
      }
    }
  }
  return { cut, fill, net: cut - fill };
}

/** Backwards-compatible signed area (positive = cutting). */
/** Quantity area for a section: cutting only for khal re-excavation. */
export function quantityArea(a: AreaResult, cfg: { cutOnly?: boolean }): number {
  return cfg.cutOnly === false ? a.net : a.cut;
}

export function sectionArea(ground: SurveyPoint[], design: SurveyPoint[]): number {
  return sectionAreas(ground, design).net;
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
  area: number;
  cut: number;
  fill: number;
}

/** Mean-area volume computation with gap handling. */
export function computeVolumes(
  sections: SectionData[],
  cfg: DesignConfig,
  maxGapMeters = 1000,
): { areas: ChainageAreaRow[]; segments: SegmentRow[]; total: number; cut: number; fill: number } {
  const sorted = [...sections].sort((a, b) => a.chainage - b.chainage);
  const areas: ChainageAreaRow[] = sorted.map((s) => {
    const a = sectionAreas(s.points, designProfile(s, cfg));
    return { chainage: s.chainage, area: quantityArea(a, cfg), cut: a.cut, fill: a.fill };
  });

  const segments: SegmentRow[] = [];
  let total = 0;
  let cut = 0;
  let fill = 0;
  for (let i = 1; i < sorted.length; i++) {
    const a = sorted[i - 1]!;
    const b = sorted[i]!;
    const distance = Math.abs(
      toMeters(b.chainage, cfg.chainageUnit) - toMeters(a.chainage, cfg.chainageUnit),
    );
    const areaFrom = areas[i - 1]!.area;
    const areaTo = areas[i]!.area;
    // Gap: empty section data on either side, or a disconnected (too long) span.
    const gap = a.points.length < 2 || b.points.length < 2 || distance > maxGapMeters;
    const meanArea = gap ? 0 : (areaFrom + areaTo) / 2;
    const volume = gap ? 0 : meanArea * distance;
    total += volume;
    if (!gap) {
      cut += ((areas[i - 1]!.cut + areas[i]!.cut) / 2) * distance;
      fill += ((areas[i - 1]!.fill + areas[i]!.fill) / 2) * distance;
    }
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
  return { areas, segments, total, cut, fill };
}

export interface ProjectStats {
  preVolume: number;
  postVolume: number;
  cutVolume: number;
  fillVolume: number;
  remaining: number;
  progress: number;
  cost: number;
  sections: number;
}

export function projectStats(project: Project): ProjectStats {
  const cfg = project.config;
  const preR = computeVolumes(project.pre, cfg);
  const post = computeVolumes(project.post, cfg).total;
  const pre = preR.total;
  // Executed work = reduction of the remaining quantity between pre and post survey.
  const executed = Math.max(Math.abs(pre) - Math.abs(post), 0);
  return {
    preVolume: pre,
    postVolume: post,
    cutVolume: preR.cut,
    fillVolume: preR.fill,
    remaining: Math.abs(post),
    progress: Math.abs(pre) > 0 ? Math.min((executed / Math.abs(pre)) * 100, 100) : 0,
    cost: executed * cfg.rate,
    sections: project.pre.length,
  };
}

export const fmt = (n: number, d = 2) =>
  Number.isFinite(n) ? n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";

export interface AbstractRow {
  /** blank spacer row printed where the alignment is discontinuous */
  spacer?: boolean;
  no?: number;
  chainage?: number;
  area?: number;
  meanArea?: number;
  /** signed distance in m (negative when chainage decreases) */
  distance?: number;
  volume?: number;
}

/** BWDB "Abstract" sheet rows: per-section area, mean area, distance and volume. */
export function abstractRows(
  sections: SectionData[],
  cfg: DesignConfig,
  maxGapMeters = 1000,
): { rows: AbstractRow[]; total: number } {
  const sorted = [...sections].sort(
    (a, b) => toMeters(a.chainage, cfg.chainageUnit) - toMeters(b.chainage, cfg.chainageUnit),
  );
  const order = cfg.startChainage >= cfg.endChainage ? [...sorted].reverse() : sorted;

  const rows: AbstractRow[] = [];
  let total = 0;
  order.forEach((s, i) => {
    const area = quantityArea(sectionAreas(s.points, designProfile(s, cfg)), cfg);
    const prev = order[i - 1];
    if (!prev) {
      rows.push({ no: i + 1, chainage: s.chainage, area });
      return;
    }
    const distance =
      toMeters(s.chainage, cfg.chainageUnit) - toMeters(prev.chainage, cfg.chainageUnit);
    const gap =
      prev.points.length < 2 || s.points.length < 2 || Math.abs(distance) > maxGapMeters;
    if (gap) {
      rows.push({ spacer: true });
      rows.push({ no: i + 1, chainage: s.chainage, area });
      return;
    }
    const prevArea = quantityArea(sectionAreas(prev.points, designProfile(prev, cfg)), cfg);
    const meanArea = (prevArea + area) / 2;
    const volume = meanArea * distance;
    total += volume;
    rows.push({ no: i + 1, chainage: s.chainage, area, meanArea, distance, volume });
  });
  return { rows, total };
}
