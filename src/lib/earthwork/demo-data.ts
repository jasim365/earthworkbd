import type { SectionData } from "./types";

const uid = () => Math.random().toString(36).slice(2, 10);

/** Demo cross-sections: chainage (KM) -> [distance, RL] pairs. */
const DEMO_PRE: Array<[number, Array<[number, number]>]> = [
  [0.0, [[-10, 14.2], [-5, 12.6], [0, 11.9], [5, 12.5], [10, 14.1]]],
  [0.25, [[-10, 14.3], [-5, 12.4], [0, 11.6], [5, 12.3], [10, 14.2]]],
  [0.75, [[-10, 14.5], [-5, 12.2], [0, 11.4], [5, 12.1], [10, 14.4]]],
  [1.25, [[-10, 14.6], [-5, 12.1], [0, 11.2], [5, 12.0], [10, 14.5]]],
  [1.75, [[-10, 14.4], [-5, 12.3], [0, 11.5], [5, 12.2], [10, 14.3]]],
  [2.25, [[-10, 14.2], [-5, 12.5], [0, 11.7], [5, 12.4], [10, 14.1]]],
];

/** Post-work survey = partially executed excavation (deeper than pre). */
const DEMO_POST: Array<[number, Array<[number, number]>]> = DEMO_PRE.map(([ch, pts]) => [
  ch,
  pts.map(([d, rl]) => [d, Math.abs(d) <= 5 ? Number((rl - 0.6).toFixed(2)) : rl] as [number, number]),
]);

const toCsv = (data: Array<[number, Array<[number, number]>]>) =>
  ["chainage,distance,rl", ...data.flatMap(([ch, pts]) => pts.map(([d, r]) => `${ch},${d},${r}`))].join(
    "\n",
  ) + "\n";

export const DEMO_PRE_CSV = toCsv(DEMO_PRE);
export const DEMO_POST_CSV = toCsv(DEMO_POST);

export const toSections = (data: Array<[number, Array<[number, number]>]>): SectionData[] =>
  data.map(([chainage, pts]) => ({
    id: uid(),
    chainage,
    points: pts.map(([distance, rl]) => ({ id: uid(), distance, rl })),
  }));

export function downloadText(filename: string, text: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Build & download a demo .xlsx with editable "Pre" and "Post" survey sheets. */
export async function downloadDemoWorkbook() {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "BWDB Earthwork Estimator";

  const info = wb.addWorksheet("Instructions");
  info.getColumn(1).width = 100;
  [
    "Earthwork Estimation Pro — survey input template",
    "",
    "1. Fill the 'Pre' sheet with your pre-work survey and the 'Post' sheet with the post-work survey.",
    "2. Columns must stay in this order: chainage, distance, rl.",
    "   • chainage — in the unit set on the Design page (KM or M), repeated for every point of a section",
    "   • distance — offset from the centre line in metres (negative = left, positive = right)",
    "   • rl — reduced level in metres",
    "3. Add as many rows / chainages as you need; leave the 'Post' sheet empty if you have no post survey.",
    "4. Save the file, then use Sections → Import Excel to load it back into the app.",
  ].forEach((t, i) => {
    const c = info.getCell(i + 1, 1);
    c.value = t;
    c.font = { name: "Arial", size: 10, bold: i === 0 };
  });

  const sheet = (name: string, data: Array<[number, Array<[number, number]>]>) => {
    const ws = wb.addWorksheet(name);
    ["chainage", "distance", "rl"].forEach((h, i) => {
      const c = ws.getCell(1, i + 1);
      c.value = h;
      c.font = { name: "Arial", size: 10, bold: true };
      c.border = { bottom: { style: "thin" } };
      ws.getColumn(i + 1).width = 14;
    });
    let r = 2;
    data.forEach(([ch, pts]) =>
      pts.forEach(([d, rl]) => {
        ws.getCell(r, 1).value = ch;
        ws.getCell(r, 1).numFmt = "0.000";
        ws.getCell(r, 2).value = d;
        ws.getCell(r, 3).value = rl;
        ws.getCell(r, 3).numFmt = "0.000";
        r++;
      }),
    );
    return ws;
  };

  sheet("Pre", DEMO_PRE);
  sheet("Post", DEMO_POST);

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "earthwork-survey-template.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}

export interface SurveySheetsImport {
  pre: SectionData[];
  post: SectionData[];
  errors: string[];
}

/** Parse a workbook that has simple "Pre" / "Post" sheets (chainage, distance, rl). */
export async function parseSurveySheetsWorkbook(file: File): Promise<SurveySheetsImport | null> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const find = (name: string) =>
    wb.worksheets.find((w) => w.name.trim().toLowerCase() === name) ?? null;
  const pre = find("pre");
  const post = find("post");
  if (!pre && !post) return null;

  const errors: string[] = [];
  const read = (ws: any, label: string): SectionData[] => {
    if (!ws) return [];
    const groups = new Map<number, Array<{ distance: number; rl: number }>>();
    ws.eachRow((row: any, i: number) => {
      if (i === 1) return;
      const num = (v: any) =>
        typeof v === "object" && v !== null && "result" in v ? Number(v.result) : Number(v);
      const c = num(row.getCell(1).value);
      const d = num(row.getCell(2).value);
      const r = num(row.getCell(3).value);
      if ([c, d, r].every((n) => Number.isFinite(n))) {
        if (!groups.has(c)) groups.set(c, []);
        groups.get(c)!.push({ distance: d, rl: r });
      } else if (row.getCell(1).value !== null && row.getCell(1).value !== undefined) {
        errors.push(`${label}!row ${i}: non-numeric chainage / distance / RL`);
      }
    });
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([chainage, pts]) => ({
        id: uid(),
        chainage,
        points: pts
          .sort((a, b) => a.distance - b.distance)
          .map((p) => ({ id: uid(), distance: p.distance, rl: p.rl })),
      }));
  };

  return { pre: read(pre, "Pre"), post: read(post, "Post"), errors };
}
