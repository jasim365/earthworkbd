import type { SectionData } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);

export interface CsvParseResult {
  sections: SectionData[];
  rows: number;
  errors: string[];
}

/**
 * Parse a CSV with columns chainage, distance, rl (header optional).
 * Rows sharing a chainage are grouped into one section.
 */
export function parseSurveyCsv(text: string): CsvParseResult {
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  if (lines.length === 0) return { sections: [], rows: 0, errors: ["File is empty"] };

  const split = (l: string) => l.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));

  let start = 0;
  const first = split(lines[0]!);
  if (first.some((c) => c !== "" && !Number.isFinite(Number(c)))) start = 1;

  const groups = new Map<number, Array<{ distance: number; rl: number }>>();
  let rows = 0;

  for (let i = start; i < lines.length; i++) {
    const cols = split(lines[i]!);
    if (cols.length < 3) {
      errors.push(`Line ${i + 1}: expected 3 columns (chainage, distance, RL)`);
      continue;
    }
    const [c, d, r] = [Number(cols[0]), Number(cols[1]), Number(cols[2])];
    if (![c, d, r].every((n) => Number.isFinite(n))) {
      errors.push(`Line ${i + 1}: non-numeric value`);
      continue;
    }
    if (!groups.has(c)) groups.set(c, []);
    groups.get(c)!.push({ distance: d, rl: r });
    rows++;
  }

  const sections: SectionData[] = [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([chainage, pts]) => ({
      id: uid(),
      chainage,
      points: pts
        .sort((a, b) => a.distance - b.distance)
        .map((p) => ({ id: uid(), distance: p.distance, rl: p.rl })),
    }));

  return { sections, rows, errors };
}

/** Merge imported sections with existing ones (imported chainages replace). */
export function mergeSections(existing: SectionData[], incoming: SectionData[]): SectionData[] {
  const map = new Map<number, SectionData>();
  existing.forEach((s) => map.set(s.chainage, s));
  incoming.forEach((s) => map.set(s.chainage, s));
  return [...map.values()].sort((a, b) => a.chainage - b.chainage);
}

export const SURVEY_CSV_TEMPLATE = `chainage,distance,rl
0,0,14.00
0,5,12.40
0,10,11.80
0,15,12.30
0,20,13.90
0.05,0,13.80
0.05,5,12.20
0.05,10,11.60
0.05,15,12.10
0.05,20,13.70
`;

/** Sorts chainages and offsets and drops unusable rows so downstream
 *  gap handling, mean-area volumes and charts recalculate correctly. */
export function normaliseSections(list: SectionData[]): SectionData[] {
  return [...list]
    .filter((s) => Number.isFinite(s.chainage))
    .sort((a, b) => a.chainage - b.chainage)
    .map((s) => ({
      ...s,
      points: [...s.points]
        .filter((p) => Number.isFinite(p.distance) && Number.isFinite(p.rl))
        .sort((a, b) => a.distance - b.distance),
    }));
}
