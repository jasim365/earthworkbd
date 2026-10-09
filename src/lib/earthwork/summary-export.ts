// Professional 4-sheet Excel export + CSV results export.
// Every number comes straight from the existing calc.ts engine — no formulas here.
import type { Project } from "./types";
import { computeVolumes, projectStats } from "./calc";

const WORK: Record<string, string> = {
  CANAL_EXCAVATION: "Canal Excavation",
  EMBANKMENT_RESECTIONING: "Embankment Re-sectioning",
};

const safeName = (s: string) => s.replace(/[^\w-]+/g, "_").slice(0, 60) || "project";

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Rows of the per-segment result table (shared by Excel and CSV exports). */
export function resultRows(project: Project) {
  const cfg = project.config;
  const out: Array<Record<string, string | number>> = [];
  for (const kind of ["pre", "post"] as const) {
    const r = computeVolumes(project[kind], cfg);
    r.areas.forEach((a, i) => {
      const seg = i > 0 ? r.segments[i - 1] : undefined;
      out.push({
        Survey: kind === "pre" ? "Pre-work" : "Post-work",
        Chainage: a.chainage,
        "Cut Area (m²)": a.cut,
        "Fill Area (m²)": a.fill,
        "Quantity Area (m²)": a.area,
        "Mean Area (m²)": seg ? seg.meanArea : "",
        "Distance (m)": seg ? seg.distance : "",
        "Volume (m³)": seg ? seg.volume : "",
        Gap: seg?.gap ? "Yes" : "",
      });
    });
  }
  return out;
}

export async function exportProfessionalWorkbook(project: Project) {
  const mod = await import("exceljs");
  const ExcelJS = (mod as any).default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = "EarthworkBD";
  wb.created = new Date();
  const cfg = project.config;
  const stats = projectStats(project);
  const font = { name: "Arial", size: 10 };
  const head = (ws: any) => {
    const r = ws.getRow(1);
    r.font = { ...font, bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };
  const kv = (name: string, rows: Array<[string, string | number]>) => {
    const ws = wb.addWorksheet(name);
    ws.columns = [
      { header: "Item", key: "k", width: 34 },
      { header: "Value", key: "v", width: 28 },
    ];
    rows.forEach(([k, v]) => ws.addRow({ k, v }));
    head(ws);
    ws.eachRow((r: any, n: number) => n > 1 && (r.font = font));
    return ws;
  };

  kv("Project Information", [
    ["Project name", project.name],
    ["Location", project.location || "—"],
    ["Work type", WORK[cfg.workType] ?? cfg.workType],
    ["Chainage unit", cfg.chainageUnit],
    ["Centre line mode", cfg.centerLineMode],
    ["Start chainage", cfg.startChainage],
    ["End chainage", cfg.endChainage],
    ["Design level (start / end, m)", `${cfg.levelStart} / ${cfg.levelEnd}`],
    ["Design width (start / end, m)", `${cfg.widthStart} / ${cfg.widthEnd}`],
    ["Side slopes CS : RS (H:1V)", `${cfg.csSlope} : ${cfg.rsSlope}`],
    ["Rate per m³", cfg.rate],
    ["Exported", new Date().toLocaleString()],
  ]);

  const inp = wb.addWorksheet("Input Data");
  inp.columns = [
    { header: "Survey", key: "s", width: 12 },
    { header: `Chainage (${cfg.chainageUnit})`, key: "c", width: 16 },
    { header: "CL Dist. (m)", key: "cl", width: 14 },
    { header: "Offset (m)", key: "d", width: 14 },
    { header: "RL (m)", key: "rl", width: 14 },
  ];
  for (const kind of ["pre", "post"] as const)
    for (const s of project[kind])
      for (const p of s.points)
        inp.addRow({ s: kind === "pre" ? "Pre" : "Post", c: s.chainage, cl: s.clDist ?? "", d: p.distance, rl: p.rl });
  head(inp);

  const res = wb.addWorksheet("Calculation Result");
  const rows = resultRows(project);
  const keys = Object.keys(rows[0] ?? { Survey: "" });
  res.columns = keys.map((k) => ({ header: k, key: k, width: k.length < 10 ? 12 : 18 }));
  rows.forEach((r) => res.addRow(r));
  res.eachRow((r: any, n: number) => {
    if (n === 1) return;
    r.eachCell((c: any) => typeof c.value === "number" && (c.numFmt = "#,##0.000"));
  });
  head(res);

  const sum = kv("Summary", [
    ["Pre-work volume (m³)", stats.preVolume],
    ["Post-work volume (m³)", stats.postVolume],
    ["Total cut (m³)", stats.cutVolume],
    ["Total fill (m³)", stats.fillVolume],
    ["Remaining (m³)", stats.remaining],
    ["Progress (%)", stats.progress],
    ["Cost of executed work", stats.cost],
    ["Number of sections", stats.sections],
  ]);
  sum.eachRow((r: any, n: number) => n > 1 && (r.getCell(2).numFmt = "#,##0.000"));

  const buf = await wb.xlsx.writeBuffer();
  download(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${safeName(project.name)}-earthwork.xlsx`,
  );
}

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function resultsCsv(project: Project): string {
  const rows = resultRows(project);
  const keys = Object.keys(rows[0] ?? { Survey: "" });
  return [keys.join(","), ...rows.map((r) => keys.map((k) => csvCell(r[k])).join(","))].join("\n");
}

export function exportResultsCsv(project: Project) {
  download(new Blob([resultsCsv(project)], { type: "text/csv" }), `${safeName(project.name)}-results.csv`);
}
