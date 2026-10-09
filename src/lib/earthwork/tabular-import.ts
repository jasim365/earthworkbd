// Generic table import (Excel / CSV / pasted cells) with column mapping onto the
// EXISTING calculator inputs. This module only shapes input data — it never
// computes areas or volumes (that stays in calc.ts).
import type { ControlPoint, SectionData, SurveyPoint } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);

/** Existing calculator input fields a column can be mapped to. */
export type FieldKey = "chainage" | "distance" | "rl" | "clDist" | "survey" | "level" | "width";

export const FIELDS: Array<{ key: FieldKey; label: string; required: boolean; hint: string }> = [
  { key: "chainage", label: "Chainage", required: true, hint: "in the project's chainage unit" },
  { key: "distance", label: "Offset / Distance (m)", required: true, hint: "distance across the section" },
  { key: "rl", label: "Existing RL (m)", required: true, hint: "ground reduced level" },
  { key: "clDist", label: "CL Dist. (m)", required: false, hint: "manual centre line offset per section" },
  { key: "survey", label: "Survey (Pre / Post)", required: false, hint: "rows tagged pre or post" },
  { key: "level", label: "Design / Formation RL (m)", required: false, hint: "control-point bed/crest level" },
  { key: "width", label: "Design Width (m)", required: false, hint: "control-point bed/crest width" },
];

export type Mapping = Partial<Record<FieldKey, number>>; // field -> column index

export interface Table {
  headers: string[];
  rows: string[][];
  /** true when the first row looked like a header row */
  hadHeader: boolean;
}

export interface MappedIssue {
  severity: "error" | "warning";
  where: string;
  message: string;
}

export interface MappedResult {
  pre: SectionData[];
  post: SectionData[];
  controlPoints: ControlPoint[];
  validRows: number;
  issues: MappedIssue[];
}

const num = (s: string | undefined): number | null => {
  if (s == null) return null;
  const t = String(s).trim().replace(/,/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

/** Split pasted / CSV text into a table. Tab, comma or semicolon separated. */
export function parseDelimited(text: string): Table {
  const lines = text.replace(/\r/g, "").split("\n");
  const first = lines.find((l) => l.trim() !== "") ?? "";
  const sep = first.includes("\t") ? "\t" : first.includes(";") ? ";" : ",";
  const raw = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
  return toTable(raw);
}

export function toTable(raw: string[][]): Table {
  const firstIdx = raw.findIndex((r) => r.some((c) => c !== ""));
  if (firstIdx < 0) return { headers: [], rows: [], hadHeader: false };
  const body = raw.slice(firstIdx);
  const head = body[0]!;
  const hadHeader = head.some((c) => c !== "" && !Number.isFinite(Number(c.replace(/,/g, ""))));
  const width = Math.max(...body.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? "");
  const headers = hadHeader
    ? pad(head).map((h, i) => h || `Column ${i + 1}`)
    : Array.from({ length: width }, (_, i) => `Column ${i + 1}`);
  return { headers, rows: (hadHeader ? body.slice(1) : body).map(pad), hadHeader };
}

const PATTERNS: Array<[FieldKey, RegExp]> = [
  ["chainage", /^(ch|chain|chainage|station|sta)\b/i],
  ["clDist", /(cl\s*dist|centre\s*line|center\s*line)/i],
  ["distance", /(dist|offset|x\b)/i],
  ["level", /(formation|design\s*(rl|level)|bed\s*level|crest\s*level)/i],
  ["rl", /(rl|level|elev|y\b)/i],
  ["width", /(width|bed\s*w|crest\s*w)/i],
  ["survey", /(survey|type|stage|pre.?post)/i],
];

/** Best-guess mapping from header names; falls back to the first 3 columns. */
export function guessMapping(t: Table): Mapping {
  const m: Mapping = {};
  const used = new Set<number>();
  if (t.hadHeader) {
    for (const [key, re] of PATTERNS)
      t.headers.forEach((h, i) => {
        if (m[key] === undefined && !used.has(i) && re.test(h)) {
          m[key] = i;
          used.add(i);
        }
      });
  }
  (["chainage", "distance", "rl"] as FieldKey[]).forEach((k, i) => {
    if (m[k] === undefined && i < t.headers.length && !used.has(i)) {
      m[k] = i;
      used.add(i);
    }
  });
  return m;
}

/** Validate a mapping and turn rows into survey sections / control points. */
export function applyMapping(
  t: Table,
  mapping: Mapping,
  defaultTarget: "pre" | "post",
): MappedResult {
  const issues: MappedIssue[] = [];
  const push = (severity: MappedIssue["severity"], where: string, message: string) => {
    if (issues.length < 200) issues.push({ severity, where, message });
  };
  const empty: MappedResult = { pre: [], post: [], controlPoints: [], validRows: 0, issues };

  for (const f of FIELDS)
    if (f.required && mapping[f.key] === undefined)
      push("error", "Mapping", `"${f.label}" must be mapped to a column.`);
  const cols = Object.entries(mapping).filter(([, v]) => v !== undefined) as Array<[FieldKey, number]>;
  const seenCol = new Map<number, FieldKey>();
  for (const [k, c] of cols) {
    if (c < 0 || c >= t.headers.length) push("error", "Mapping", `"${k}" points to a column that does not exist.`);
    else if (seenCol.has(c))
      push("error", "Mapping", `Column "${t.headers[c]}" is mapped to more than one field.`);
    seenCol.set(c, k);
  }
  if (issues.some((i) => i.severity === "error")) return empty;

  const offset = t.hadHeader ? 2 : 1;
  const maps = { pre: new Map<number, SurveyPoint[]>(), post: new Map<number, SurveyPoint[]>() };
  const clDist = { pre: new Map<number, number>(), post: new Map<number, number>() };
  const cps = new Map<number, ControlPoint>();
  const seen = new Set<string>();
  let validRows = 0;

  t.rows.forEach((r, idx) => {
    const where = `Row ${idx + offset}`;
    if (r.every((c) => c.trim() === "")) {
      push("warning", where, "Empty row skipped.");
      return;
    }
    const get = (k: FieldKey) => (mapping[k] === undefined ? undefined : r[mapping[k]!]);
    const ch = num(get("chainage"));
    const d = num(get("distance"));
    const rl = num(get("rl"));
    const bad: string[] = [];
    const missing: string[] = [];
    ([["Chainage", ch, "chainage"], ["Offset", d, "distance"], ["RL", rl, "rl"]] as const).forEach(
      ([name, v, k]) => {
        if (v === null) missing.push(name);
        else if (Number.isNaN(v)) bad.push(`${name} "${get(k)}"`);
      },
    );
    if (missing.length) {
      push("error", where, `Missing value: ${missing.join(", ")}.`);
      return;
    }
    if (bad.length) {
      push("error", where, `Invalid number: ${bad.join(", ")}.`);
      return;
    }

    let target: "pre" | "post" = defaultTarget;
    const tag = get("survey");
    if (mapping.survey !== undefined) {
      const s = (tag ?? "").trim().toLowerCase();
      if (s.startsWith("pre")) target = "pre";
      else if (s.startsWith("post")) target = "post";
      else if (s !== "") push("warning", where, `Survey "${tag}" is not Pre or Post — used ${defaultTarget}.`);
    }

    const key = `${target}|${ch}|${d}`;
    if (seen.has(key)) {
      push("warning", where, `Duplicate offset ${d} m at chainage ${ch} — later row skipped.`);
      return;
    }
    seen.add(key);

    const list = maps[target].get(ch!) ?? [];
    list.push({ id: uid(), distance: d!, rl: rl! });
    maps[target].set(ch!, list);
    validRows++;

    const cl = num(get("clDist"));
    if (cl !== null && cl !== undefined) {
      if (Number.isNaN(cl)) push("error", where, `Invalid CL Dist. "${get("clDist")}".`);
      else clDist[target].set(ch!, cl);
    }
    const lv = num(get("level"));
    const wd = num(get("width"));
    if (Number.isNaN(lv as number)) push("error", where, `Invalid design RL "${get("level")}".`);
    if (Number.isNaN(wd as number)) push("error", where, `Invalid design width "${get("width")}".`);
    const lvOk = lv !== null && !Number.isNaN(lv);
    const wdOk = wd !== null && !Number.isNaN(wd);
    if (lvOk || wdOk) {
      const cp = cps.get(ch!) ?? { id: uid(), chainage: ch! };
      if (lvOk) cp.level = lv!;
      if (wdOk) cp.width = wd!;
      cps.set(ch!, cp);
    }
  });

  const build = (k: "pre" | "post"): SectionData[] =>
    [...maps[k].entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([chainage, pts]) => {
        if (pts.length < 2)
          push("warning", `Chainage ${chainage}`, "Only 1 point — at least 2 are needed for a cross-section.");
        const s: SectionData = {
          id: uid(),
          chainage,
          points: [...pts].sort((a, b) => a.distance - b.distance),
        };
        const cl = clDist[k].get(chainage);
        if (cl !== undefined) s.clDist = cl;
        return s;
      });

  const pre = build("pre");
  const post = build("post");
  if (validRows === 0) push("error", "Data", "No valid data rows found — check the column mapping.");
  return {
    pre,
    post,
    controlPoints: [...cps.values()].sort((a, b) => a.chainage - b.chainage),
    validRows,
    issues,
  };
}

/** Read the first (or named) worksheet of an .xlsx file as a plain table. */
export async function readWorkbookTables(file: File): Promise<Record<string, Table>> {
  const mod = await import("exceljs");
  const ExcelJS = (mod as any).default ?? mod;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const out: Record<string, Table> = {};
  wb.worksheets.forEach((ws: any) => {
    const raw: string[][] = [];
    ws.eachRow({ includeEmpty: true }, (row: any, n: number) => {
      const cells: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) cells.push(cellStr(row.getCell(c).value));
      raw[n - 1] = cells;
    });
    out[String(ws.name)] = toTable(Array.from(raw, (r) => r ?? []));
  });
  return out;
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return String(v).trim();
  if (v instanceof Date) return v.toISOString();
  const o = v as Record<string, unknown>;
  if ("result" in o) return cellStr(o["result"]);
  if ("richText" in o) return ((o["richText"] as Array<{ text: string }>) ?? []).map((r) => r.text).join("");
  if ("text" in o) return String(o["text"] ?? "");
  if ("error" in o) return String(o["error"]);
  return "";
}
