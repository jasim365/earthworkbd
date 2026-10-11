import { designLevelAt, interpAt, resolvedCenterLine } from "./calc";
import type { Project } from "./types";

export interface LongitudinalPoint {
  chainage: number;
  groundRL: number | null;
  formationRL: number | null;
  centerLine: number | null;
}

/** Presentation adapter only: all levels/centre-line interpolation use the locked engine. */
export function longitudinalPoints(project: Project): LongitudinalPoint[] {
  const surveyed = [...new Set([...project.pre, ...project.post].map((s) => s.chainage))]
    .filter(Number.isFinite).sort((a, b) => a - b);
  const first = surveyed[0];
  const last = surveyed[surveyed.length - 1];
  if (first === undefined || last === undefined) return [];
  const controls = [project.config.startChainage, project.config.endChainage,
    ...project.config.controlPoints.map((p) => p.chainage)]
    .filter((ch) => Number.isFinite(ch) && ch >= first && ch <= last);
  return [...new Set([...surveyed, ...controls])].sort((a, b) => a - b).map((chainage) => {
    const section = project.pre.find((s) => s.chainage === chainage);
    const centerLine = section ? resolvedCenterLine(section, project.config) : null;
    const ground = section && centerLine !== null ? interpAt(section.points, centerLine) : null;
    const formation = designLevelAt(chainage, project.config);
    return {
      chainage,
      centerLine: centerLine !== null && Number.isFinite(centerLine) ? centerLine : null,
      groundRL: ground !== null && Number.isFinite(ground) ? ground : null,
      formationRL: Number.isFinite(formation) ? formation : null,
    };
  });
}