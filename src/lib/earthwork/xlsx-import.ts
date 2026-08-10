import type { SectionData, SurveyPoint } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);

export type ImportSeverity = "error" | "warning";

export interface ImportIssue {
  severity: ImportSeverity;
  /** e.g. "Chart_Datasets!C7" or "Header row 4" */
  where: string;
  message: string;
}

export interface ChartDatasetImport {
  ok: boolean;
  pre: SectionData[];
  post: SectionData[];
  points: number;
  issues: ImportIssue[];
  /** Back-compat: plain messages for the fatal/error issues. */
  errors: string[];
}

const SHEET = "Chart_Datasets";
const MAX_ISSUES = 40;
const MAX_ABS_DISTANCE = 100000; // m
const MIN_RL = -1000;
const MAX_RL = 10000;

const colName = (n: number): string => {
  let s = "";
  let x = n;
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
};
const ref = (r: number, c: number) => `${SHEET}!${colName(c)}${r}`;

type CellValue = { kind: "empty" } | { kind: "number"; value: number } | { kind: "bad"; raw: string };

const readCell = (v: unknown): CellValue => {
  if (v == null || v === "") return { kind: "empty" };
  if (typeof v === "number") return Number.isFinite(v) ? { kind: "number", value: v } : { kind: "bad", raw: String(v) };
  if (typeof v === "boolean") return { kind: "bad", raw: String(v) };
  if (v instanceof Date) return { kind: "bad", raw: v.toISOString() };
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("error" in o) return { kind: "bad", raw: String(o["error"]) };
    if ("result" in o) return readCell(o["result"]);
    if ("richText" in o) return readCell(cellText(v));
    if ("text" in o) return readCell(o["text"]);
    return { kind: "bad", raw: "unsupported cell" };
  }
  const t = String(v).trim();
  if (t === "") return { kind: "empty" };
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? { kind: "number", value: n } : { kind: "bad", raw: t };
};

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("richText" in o)
      return ((o["richText"] as Array<{ text: string }>) ?? []).map((r) => r.text).join("");
    if ("text" in o) return String(o["text"] ?? "");
    if ("result" in o) return String(o["result"] ?? "");
    return "";
  }
  return String(v);
}

/**
 * Parse an edited Chart_Datasets sheet (as produced by the Excel export) back
 * into pre-work and post-work sections, with strict structural + value checks.
 */
export async function parseChartDatasetsWorkbook(file: File): Promise<ChartDatasetImport> {
  const issues: ImportIssue[] = [];
  const push = (severity: ImportSeverity, where: string, message: string) => {
    if (issues.length < MAX_ISSUES) issues.push({ severity, where, message });
  };
  const fail = (message: string, where = file.name): ChartDatasetImport => ({
    ok: false,
    pre: [],
    post: [],
    points: 0,
    issues: [{ severity: "error", where, message }, ...issues],
    errors: [message],
  });

  if (!/\.xlsx$/i.test(file.name))
    return fail(`"${file.name}" is not an .xlsx file. Export the workbook from this app, edit it, then re-import.`);

  const ExcelJS = (await import("exceljs")).default ?? (await import("exceljs"));
  const wb = new (ExcelJS as unknown as { Workbook: new () => any }).Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return fail("The file could not be opened as an Excel workbook (it may be corrupt or saved in another format).");
  }

  const names: string[] = (wb.worksheets ?? []).map((w: any) => String(w.name));
  if (names.length === 0) return fail("The workbook has no worksheets.");
  const match = names.find((n) => n.trim().toLowerCase() === SHEET.toLowerCase());
  if (!match)
    return fail(
      `No "${SHEET}" sheet found. Sheets in this workbook: ${names.join(", ")}. Do not rename the sheet when editing.`,
    );
  const ws = wb.getWorksheet(match);

  const titleRow = ws.getRow(3);
  const headRow = ws.getRow(4);
  const lastCol = Math.max(ws.columnCount ?? 0, headRow.cellCount ?? 0);
  const lastRow = Math.max(ws.rowCount ?? 0, 5);
  if (lastCol < 2 || lastRow < 5)
    return fail(`The "${SHEET}" sheet is empty. Expected chainage titles in row 3, headers in row 4 and data from row 5.`);

  const preMap = new Map<number, SurveyPoint[]>();
  const postMap = new Map<number, SurveyPoint[]>();
  let chainage: number | null = null;
  let chainageLabel = "";
  let points = 0;
  let headersFound = 0;
  let dataColumns = 0;

  for (let c = 1; c <= lastCol; c++) {
    const title = cellText(titleRow.getCell(c).value).trim();
    if (title) {
      const m = /CH\s*(-?\d+(?:\.\d+)?)/i.exec(title);
      if (m) {
        chainage = Number(m[1]);
        chainageLabel = title;
      } else {
        push("warning", ref(3, c), `Title "${title}" has no recognisable "CH <number>" chainage and was ignored.`);
      }
    }

    const head = cellText(headRow.getCell(c).value).trim();
    if (!head) continue;
    headersFound++;
    const parsed = /^(.*?)\s+([XY])$/i.exec(head);
    if (!parsed) {
      push("error", ref(4, c), `Header "${head}" is malformed. Expected "Pre-work X", "Pre-work Y", "Post-work X" or "Post-work Y".`);
      continue;
    }
    const label = parsed[1].trim().toLowerCase();
    const axis = parsed[2].toUpperCase();
    if (axis === "Y") continue; // handled with its X partner

    const target = label.startsWith("pre") ? preMap : label.startsWith("post") ? postMap : null;
    if (!target) {
      if (!label.startsWith("design"))
        push("warning", ref(4, c), `Unknown dataset "${parsed[1].trim()}" ignored — only Pre-work and Post-work are imported.`);
      continue;
    }

    const partner = cellText(headRow.getCell(c + 1).value).trim();
    if (!new RegExp(`^${parsed[1].trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+Y$`, "i").test(partner)) {
      push("error", ref(4, c + 1), `Column "${head}" has no matching "${parsed[1].trim()} Y" column beside it (found "${partner || "empty"}").`);
      continue;
    }

    if (chainage === null || !Number.isFinite(chainage)) {
      push("error", ref(3, c), `No chainage title above "${head}" — add a title like "CH 1.250" in row 3.`);
      continue;
    }

    const pts: SurveyPoint[] = [];
    const seen = new Set<number>();
    for (let r = 5; r <= lastRow; r++) {
      const x = readCell(ws.getCell(r, c).value);
      const y = readCell(ws.getCell(r, c + 1).value);
      if (x.kind === "empty" && y.kind === "empty") continue;
      if (x.kind === "bad") {
        push("error", ref(r, c), `"${x.raw}" is not a valid distance (${chainageLabel || `CH ${chainage}`}, ${head}).`);
        continue;
      }
      if (y.kind === "bad") {
        push("error", ref(r, c + 1), `"${y.raw}" is not a valid reduced level (${chainageLabel || `CH ${chainage}`}).`);
        continue;
      }
      if (x.kind === "empty" || y.kind === "empty") {
        push(
          "error",
          ref(r, x.kind === "empty" ? c : c + 1),
          `Missing ${x.kind === "empty" ? "X (distance)" : "Y (RL)"} value — X and Y must both be filled in.`,
        );
        continue;
      }
      if (Math.abs(x.value) > MAX_ABS_DISTANCE) {
        push("error", ref(r, c), `Distance ${x.value} m is outside the plausible range ±${MAX_ABS_DISTANCE} m.`);
        continue;
      }
      if (y.value < MIN_RL || y.value > MAX_RL) {
        push("error", ref(r, c + 1), `RL ${y.value} m is outside the plausible range ${MIN_RL} to ${MAX_RL} m.`);
        continue;
      }
      if (seen.has(x.value)) push("warning", ref(r, c), `Duplicate distance ${x.value} m in this section.`);
      seen.add(x.value);
      pts.push({ id: uid(), distance: x.value, rl: y.value });
    }

    dataColumns++;
    if (pts.length === 0) {
      push("warning", ref(5, c), `"${head}" at ${chainageLabel || `CH ${chainage}`} has no data rows.`);
      continue;
    }
    if (pts.length < 2) {
      push("error", ref(5, c), `${chainageLabel || `CH ${chainage}`} ${head}: at least 2 valid points are needed to form a cross-section.`);
      continue;
    }
    points += pts.length;
    if (target.has(chainage))
      push("warning", ref(3, c), `Chainage ${chainage} appears more than once — points were merged.`);
    const prev = target.get(chainage) ?? [];
    target.set(chainage, [...prev, ...pts].sort((a, b) => a.distance - b.distance));
  }

  if (headersFound === 0)
    return fail(`Row 4 of "${SHEET}" has no column headers. Expected "Pre-work X" / "Pre-work Y" pairs.`);
  if (dataColumns === 0)
    return fail(`No "Pre-work" or "Post-work" X/Y column pairs found in "${SHEET}". Check the row 4 headers.`);

  const toSections = (m: Map<number, SurveyPoint[]>): SectionData[] =>
    [...m.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([ch, pts]) => ({ id: uid(), chainage: ch, points: pts }));

  const errors = issues.filter((i) => i.severity === "error");
  return {
    ok: points > 0,
    pre: toSections(preMap),
    post: toSections(postMap),
    points,
    issues,
    errors: errors.map((e) => `${e.where}: ${e.message}`),
  };
}
