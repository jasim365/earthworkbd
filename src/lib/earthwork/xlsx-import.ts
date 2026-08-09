import type { SectionData, SurveyPoint } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);

export interface ChartDatasetImport {
  pre: SectionData[];
  post: SectionData[];
  points: number;
  errors: string[];
}

const cellNum = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  if (v && typeof v === "object" && "result" in (v as Record<string, unknown>))
    return cellNum((v as { result: unknown }).result);
  return null;
};

const cellText = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && "richText" in (v as Record<string, unknown>))
    return ((v as { richText: Array<{ text: string }> }).richText ?? []).map((r) => r.text).join("");
  if (typeof v === "object" && "text" in (v as Record<string, unknown>))
    return String((v as { text: unknown }).text ?? "");
  return String(v);
};

/**
 * Parse an edited Chart_Datasets sheet (as produced by the Excel export) back
 * into pre-work and post-work sections.
 */
export async function parseChartDatasetsWorkbook(file: File): Promise<ChartDatasetImport> {
  const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new (ExcelJS as unknown as { Workbook: new () => any }).Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const ws = wb.getWorksheet("Chart_Datasets") ?? wb.worksheets?.[0];
  const errors: string[] = [];
  if (!ws) return { pre: [], post: [], points: 0, errors: ["No Chart_Datasets sheet found"] };

  const titleRow = ws.getRow(3);
  const headRow = ws.getRow(4);
  const lastCol = Math.max(ws.columnCount ?? 0, headRow.cellCount ?? 0);
  const lastRow = ws.rowCount ?? 5;

  const preMap = new Map<number, SurveyPoint[]>();
  const postMap = new Map<number, SurveyPoint[]>();
  let chainage: number | null = null;
  let points = 0;

  for (let c = 1; c <= lastCol; c++) {
    const title = cellText(titleRow.getCell(c).value);
    const m = /CH\s*(-?[\d.]+)/i.exec(title);
    if (m) chainage = Number(m[1]);

    const head = cellText(headRow.getCell(c).value).trim();
    if (!/\sX$/i.test(head)) continue;
    const label = head.replace(/\sX$/i, "").trim().toLowerCase();
    const target = label.startsWith("pre") ? preMap : label.startsWith("post") ? postMap : null;
    if (!target) continue; // skip Design columns
    if (chainage === null || !Number.isFinite(chainage)) {
      errors.push(`Column ${c}: no chainage title found above "${head}"`);
      continue;
    }

    const pts: SurveyPoint[] = [];
    for (let r = 5; r <= lastRow; r++) {
      const x = cellNum(ws.getCell(r, c).value);
      const y = cellNum(ws.getCell(r, c + 1).value);
      if (x === null && y === null) continue;
      if (x === null || y === null) {
        errors.push(`Row ${r}, column ${c}: incomplete X/Y pair`);
        continue;
      }
      pts.push({ id: uid(), distance: x, rl: y });
    }
    if (pts.length === 0) continue;
    points += pts.length;
    const prev = target.get(chainage) ?? [];
    target.set(chainage, [...prev, ...pts].sort((a, b) => a.distance - b.distance));
  }

  const toSections = (m: Map<number, SurveyPoint[]>): SectionData[] =>
    [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([ch, pts]) => ({ id: uid(), chainage: ch, points: pts }));

  return { pre: toSections(preMap), post: toSections(postMap), points, errors };
}
