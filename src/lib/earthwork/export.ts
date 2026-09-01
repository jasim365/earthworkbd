import type { Project, SectionData } from "./types";
import { rgbToHex } from "./types";
import {
  computeVolumes,
  designLevelAt,
  designProfile,
  designWidthAt,
  interpAt,
  sectionAreas,
  abstractRows,
} from "./calc";

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

function label(ws: any, row: number, col: number, text: string) {
  const c = ws.getCell(row, col);
  c.value = text;
  c.font = { name: "Arial", size: 10, bold: true };
  c.alignment = { horizontal: "right" };
}

function val(ws: any, row: number, col: number, v: string | number, color = "FFFF0000") {
  const c = ws.getCell(row, col);
  c.value = v;
  c.font = { name: "Arial", size: 10, color: { argb: color } };
  if (typeof v === "number") c.numFmt = "0.000";
}

function header(ws: any, row: number, col: number, text: string) {
  const c = ws.getCell(row, col);
  c.value = text;
  c.font = { name: "Arial", size: 10, bold: true };
  c.alignment = { horizontal: "center" };
  c.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}

/** Build and download the full BWDB-format workbook. */
export async function exportWorkbook(project: Project) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "BWDB Earthwork Estimator & Excel Engine";
  wb.created = new Date();

  const cfg = project.config;
  const km = cfg.chainageUnit === "KM";

  // ---------- Design Section ----------
  const ds = wb.addWorksheet("Design Section");
  ds.getColumn(3).width = 32;
  ds.getColumn(4).width = 16;
  ds.getColumn(5).width = 16;
  ds.getColumn(8).width = 30;
  ds.getColumn(9).width = 16;
  ds.getCell("C2").value = "Design Section";
  ds.getCell("C2").font = { name: "Arial", size: 12, bold: true, underline: true };

  const rows: Array<[string, string | number]> = [
    ["Type of Work:", cfg.workType === "CANAL_EXCAVATION" ? "Canal Excavation" : "Re-sectioning"],
    ["Chainage in:", km ? "Kilometers" : "Meters"],
    ["C/S Slope=", `1:${cfg.csSlope}`],
    ["R/S Slope=", `1:${cfg.rsSlope}`],
    [
      "Center Line Type=",
      { MANUAL: "Manual", LOWEST_EARTH: "Lowest Earth", MIDDLE: "Middle", START_X: "StartX" }[
        cfg.centerLineMode
      ],
    ],
  ];
  rows.forEach(([k, v], i) => {
    label(ds, 3 + i, 3, k);
    val(ds, 3 + i, 4, v);
  });

  label(ds, 9, 3, `Chainage, in ${km ? "KM" : "M"}`);
  val(ds, 9, 4, cfg.startChainage);
  val(ds, 9, 5, cfg.endChainage);
  label(ds, 10, 3, "Design Crest/Bed Level, in mSOB");
  val(ds, 10, 4, cfg.levelStart);
  val(ds, 10, 5, cfg.levelEnd);
  label(ds, 11, 3, "Design Crest/Bed Width, in M");
  val(ds, 11, 4, cfg.widthStart);
  val(ds, 11, 5, cfg.widthEnd);
  label(ds, 12, 3, "Level Type=");
  val(ds, 12, 4, cfg.levelMode);
  label(ds, 13, 3, "Width Type=");
  val(ds, 13, 4, cfg.widthMode);
  label(ds, 14, 3, "Fixed Length=");
  val(ds, 14, 4, cfg.fixedLength);
  label(ds, 15, 3, "Rate per Cum=");
  val(ds, 15, 4, cfg.rate);

  ds.getCell("H2").value = "Postwork Calculations:";
  ds.getCell("H2").font = { name: "Arial", size: 10, bold: true, underline: true };
  label(ds, 3, 8, "Calculate Progress=");
  val(ds, 3, 9, cfg.calculateProgress ? "Yes" : "No");

  ds.getCell("H6").value = "Color Control:";
  ds.getCell("H6").font = { name: "Arial", size: 10, bold: true, underline: true };
  const colorRows: Array<[string, { r: number; g: number; b: number }]> = [
    ["Prework RGB=", cfg.colorPre],
    ["Adjusted Postwork RGB=", cfg.colorPostAdjusted],
    ["Original Postwork RGB=", cfg.colorPostOriginal],
    ["Design RGB=", cfg.colorDesign],
  ];
  colorRows.forEach(([k, c], i) => {
    const r = 7 + i;
    label(ds, r, 8, k);
    [c.r, c.g, c.b].forEach((n, j) => {
      const cell = ds.getCell(r, 9 + j);
      cell.value = n;
      cell.font = { name: "Arial", size: 10, color: { argb: argb(rgbToHex(c)) } };
    });
  });

  // ---------- Pre ----------
  const preWs = wb.addWorksheet("Pre");
  preWs.getCell("B2").value = "No. of sections:";
  preWs.getCell("B2").font = { name: "Arial", size: 10, bold: true };
  preWs.getCell("C2").value = project.pre.length;
  writeSurveyGrid(preWs, project.pre, cfg.chainageUnit);

  // ---------- Post ----------
  if (project.post.length) {
    const postWs = wb.addWorksheet("Post");
    postWs.getCell("B2").value = "No. of sections:";
    postWs.getCell("B2").font = { name: "Arial", size: 10, bold: true };
    postWs.getCell("C2").value = project.post.length;
    writeSurveyGrid(postWs, project.post, cfg.chainageUnit);
  }

  // ---------- Abstract ----------
  const ab = wb.addWorksheet("Abstract");
  const { segments, areas, total } = computeVolumes(project.pre, cfg);
  ab.getCell("A1").value = `Abstract Estimate for Earth Calculation — ${project.name} (${project.location})`;
  ab.getCell("A1").font = { name: "Arial", size: 11, bold: true };
  ab.mergeCells("A1:F1");
  const abHead = ["C/S No.", `Ch. in ${km ? "KM" : "M"}`, "Area in Sqm", "Mean Area", "Dist. in m.", "Volume of E/W in Cum"];
  abHead.forEach((h, i) => header(ab, 3, i + 1, h));
  [8, 14, 14, 14, 14, 22].forEach((w, i) => (ab.getColumn(i + 1).width = w));

  let r = 4;
  const sortedPre = [...project.pre].sort((a, b) => a.chainage - b.chainage);
  sortedPre.forEach((s, i) => {
    const seg = i > 0 ? segments[i - 1] : undefined;
    if (seg?.gap) r++; // blank gap row
    ab.getCell(r, 1).value = i + 1;
    ab.getCell(r, 2).value = s.chainage;
    ab.getCell(r, 2).numFmt = "0.000";
    ab.getCell(r, 3).value = Number(areas[i]!.area.toFixed(3));
    ab.getCell(r, 3).numFmt = "0.000";
    if (seg && !seg.gap) {
      const prev = r - 1;
      ab.getCell(r, 4).value = { formula: `AVERAGE(C${prev},C${r})` };
      ab.getCell(r, 4).numFmt = "0.000";
      ab.getCell(r, 5).value = Number(seg.distance.toFixed(2));
      ab.getCell(r, 5).numFmt = "0.00";
      ab.getCell(r, 6).value = { formula: `D${r}*E${r}` };
      ab.getCell(r, 6).numFmt = '0.00" Cum"';
    }
    r++;
  });
  ab.getCell(r + 1, 5).value = "Total=";
  ab.getCell(r + 1, 5).font = { name: "Arial", size: 10, bold: true };
  ab.getCell(r + 1, 6).value = { formula: `SUM(F4:F${r - 1})`, result: Number(total.toFixed(2)) };
  ab.getCell(r + 1, 6).numFmt = '0.00" Cum"';
  ab.getCell(r + 1, 6).font = { name: "Arial", size: 10, bold: true };

  // ---------- Detailed ----------
  const det = wb.addWorksheet("Detailed");
  det.getCell("A1").value = `Detailed Estimate for Earth Calculation — ${project.name}`;
  det.getCell("A1").font = { name: "Arial", size: 11, bold: true };
  det.mergeCells("A1:K1");
  [10, 10, 10, 8, 12, 10, 10, 10, 8, 12].forEach((w, i) => (det.getColumn(i + 1).width = w));

  let dr = 3;
  sortedPre.forEach((s, i) => {
    const post = [...project.post].sort((a, b) => a.chainage - b.chainage)[i];
    const design = designProfile(s, cfg);
    const a = sectionAreas(s.points, design);
    det.getCell(dr, 1).value = `X-Section No-${i + 1} At ${km ? "KM" : "M"} ${s.chainage}`;
    det.getCell(dr, 1).font = { name: "Arial", size: 10, bold: true };
    dr++;
    det.getCell(dr, 1).value = "Pre-work";
    det.getCell(dr, 6).value = "Post-work / Design";
    det.getCell(dr, 1).font = { name: "Arial", size: 10, bold: true };
    det.getCell(dr, 6).font = { name: "Arial", size: 10, bold: true };
    dr++;
    ["Meterage", "RL", "Mean", "Dist.", "Volume"].forEach((h, j) => header(det, dr, j + 1, h));
    ["Meterage", "RL", "Mean", "Dist.", "Volume"].forEach((h, j) => header(det, dr, j + 6, h));
    dr++;
    const start = dr;
    const left = s.points;
    const right = (post?.points?.length ? post.points : design) ?? [];
    const n = Math.max(left.length, right.length);
    for (let k = 0; k < n; k++) {
      const lp = left[k];
      const rp = right[k];
      if (lp) {
        det.getCell(dr, 1).value = lp.distance;
        det.getCell(dr, 2).value = Number(lp.rl.toFixed(3));
        if (k > 0) {
          det.getCell(dr, 3).value = { formula: `AVERAGE(B${dr - 1},B${dr})` };
          det.getCell(dr, 4).value = { formula: `A${dr}-A${dr - 1}` };
          det.getCell(dr, 5).value = { formula: `C${dr}*D${dr}` };
        }
      }
      if (rp) {
        det.getCell(dr, 6).value = rp.distance;
        det.getCell(dr, 7).value = Number(rp.rl.toFixed(3));
        if (k > 0) {
          det.getCell(dr, 8).value = { formula: `AVERAGE(G${dr - 1},G${dr})` };
          det.getCell(dr, 9).value = { formula: `F${dr}-F${dr - 1}` };
          det.getCell(dr, 10).value = { formula: `H${dr}*I${dr}` };
        }
      }
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach((c) => (det.getCell(dr, c).numFmt = "0.000"));
      dr++;
    }
    det.getCell(dr, 5).value = { formula: `SUM(E${start}:E${dr - 1})` };
    det.getCell(dr, 10).value = { formula: `SUM(J${start}:J${dr - 1})` };
    det.getCell(dr, 5).numFmt = "0.000";
    det.getCell(dr, 10).numFmt = "0.000";
    dr++;
    det.getCell(dr, 4).value = "Cut Area=";
    det.getCell(dr, 5).value = Number(a.cut.toFixed(3));
    det.getCell(dr, 9).value = "Fill Area=";
    det.getCell(dr, 10).value = Number(a.fill.toFixed(3));
    dr += 3;
  });

  // ---------- Chart_Datasets ----------
  const cd = wb.addWorksheet("Chart_Datasets");
  cd.getCell("A1").value =
    "Editable X-Y datasets (X = Offset Distance in m, Y = RL in mSOB). Insert an XY Scatter chart on any block — values update the chart automatically.";
  cd.getCell("A1").font = { name: "Arial", size: 10, italic: true };

  let col = 1;
  sortedPre.forEach((s, i) => {
    const design = designProfile(s, cfg);
    const post = [...project.post].sort((a, b) => a.chainage - b.chainage)[i];
    const blocks: Array<[string, Array<{ distance: number; rl: number }>]> = [
      ["Pre-work", s.points],
      ["Design", design],
    ];
    if (post) blocks.push(["Post-work", post.points]);

    cd.getCell(3, col).value = `X-Section ${i + 1} — CH ${s.chainage} ${km ? "KM" : "M"}`;
    cd.getCell(3, col).font = { name: "Arial", size: 10, bold: true };
    let c = col;
    blocks.forEach(([name, pts]) => {
      header(cd, 4, c, `${name} X`);
      header(cd, 4, c + 1, `${name} Y`);
      cd.getColumn(c).width = 13;
      cd.getColumn(c + 1).width = 13;
      pts.forEach((p, k) => {
        cd.getCell(5 + k, c).value = Number(p.distance.toFixed(3));
        cd.getCell(5 + k, c + 1).value = Number(p.rl.toFixed(3));
        cd.getCell(5 + k, c).numFmt = "0.000";
        cd.getCell(5 + k, c + 1).numFmt = "0.000";
      });
      c += 2;
    });
    col = c + 1; // blank spacer column between sections
  });

  // ---------- Charts (rendered images) ----------
  try {
    const ch = wb.addWorksheet("Charts");
    ch.getCell("A1").value = "Visualization charts (rendered from the app)";
    ch.getCell("A1").font = { name: "Arial", size: 12, bold: true };

    let imgRow = 2;
    let drawn = 0;
    const volPng = renderVolumeChart(project);
    if (volPng) {
      const id = wb.addImage({ base64: volPng, extension: "png" });
      ch.addImage(id, { tl: { col: 0.2, row: imgRow }, ext: { width: 900, height: 380 } });
      imgRow += 21;
      drawn++;
    }
    const MAX_SECTION_CHARTS = 40;
    const sortedPost = [...project.post].sort((a, b) => a.chainage - b.chainage);
    sortedPre.slice(0, MAX_SECTION_CHARTS).forEach((s) => {
      const post = sortedPost.find((p) => Math.abs(p.chainage - s.chainage) < 1e-6);
      const png = renderSectionChart(s, post, cfg, km);
      if (!png) return;
      const id = wb.addImage({ base64: png, extension: "png" });
      ch.addImage(id, { tl: { col: 0.2, row: imgRow }, ext: { width: 900, height: 360 } });
      imgRow += 20;
      drawn++;
    });
    if (sortedPre.length > MAX_SECTION_CHARTS) {
      ch.getCell(`A${imgRow + 1}`).value = `Showing first ${MAX_SECTION_CHARTS} of ${sortedPre.length} cross-sections. Full data is on the Chart_Datasets sheet.`;
      ch.getCell(`A${imgRow + 1}`).font = { name: "Arial", size: 10, italic: true };
    }
    if (drawn === 0) {
      ch.getCell("A3").value =
        "No charts could be rendered: at least one cross-section with 2+ survey points is required.";
      ch.getCell("A3").font = { name: "Arial", size: 10, italic: true };
    }

  } catch {
    // charts are best-effort; the workbook still exports without them
  }

  wb.eachSheet((ws: any) => {

    ws.eachRow((row: any) => {
      row.eachCell((cell: any) => {
        if (!cell.font) cell.font = { name: "Arial", size: 10 };
        else if (!cell.font.name) cell.font = { ...cell.font, name: "Arial", size: 10 };
      });
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  download(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${slug(project.name)}-bwdb-estimate.xlsx`,
  );
}

function writeSurveyGrid(ws: any, sections: SectionData[], unit: "KM" | "M") {
  const sorted = [...sections].sort((a, b) => a.chainage - b.chainage);
  let col = 2;
  sorted.forEach((s, i) => {
    ws.getCell(3, col).value = `X-section-${i + 1}`;
    ws.getCell(3, col).font = { name: "Arial", size: 10, bold: true };
    ws.getCell(4, col).value = `Chainage (${unit})`;
    ws.getCell(4, col + 1).value = s.chainage;
    ws.getCell(4, col + 1).numFmt = "0.000";
    ws.getCell(5, col).value = "CL Dist.";
    ws.getCell(5, col + 1).value = s.clDist ?? "";
    header(ws, 6, col, "Dist.");
    header(ws, 6, col + 1, "RL");
    ws.getColumn(col).width = 12;
    ws.getColumn(col + 1).width = 12;
    s.points.forEach((p, k) => {
      ws.getCell(7 + k, col).value = Number(p.distance.toFixed(2));
      ws.getCell(7 + k, col + 1).value = Number(p.rl.toFixed(3));
      ws.getCell(7 + k, col).numFmt = "0.00";
      ws.getCell(7 + k, col + 1).numFmt = "0.000";
    });
    col += 2;
  });
}

/** Export cross-sections as an AutoCAD R12 ASCII DXF drawing. */
export function exportDxf(project: Project) {
  const cfg = project.config;
  const layers: Array<[string, number]> = [
    ["PRE_WORK_PROFILE", 1],
    ["POST_WORK_PROFILE", 3],
    ["DESIGN_PROFILE", 8],
    ["LABELS", 7],
  ];
  const out: string[] = [
    "0", "SECTION", "2", "HEADER",
    "9", "$ACADVER", "1", "AC1009",
    "9", "$INSBASE", "10", "0.0", "20", "0.0", "30", "0.0",
    "0", "ENDSEC",
    "0", "SECTION", "2", "TABLES",
    "0", "TABLE", "2", "LAYER", "70", String(layers.length),
  ];
  layers.forEach(([name, color]) => {
    out.push("0", "LAYER", "2", name, "70", "0", "62", String(color), "6", "CONTINUOUS");
  });
  out.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");

  const sorted = [...project.pre].sort((a, b) => a.chainage - b.chainage);
  const sortedPost = [...project.post].sort((a, b) => a.chainage - b.chainage);

  sorted.forEach((s, i) => {
    const yOff = i * 60;
    poly(out, "PRE_WORK_PROFILE", s.points, 0, yOff, 1);
    poly(out, "DESIGN_PROFILE", designProfile(s, cfg), 0, yOff, 8);
    const post = sortedPost.find((p) => p.chainage === s.chainage) ?? sortedPost[i];
    if (post) poly(out, "POST_WORK_PROFILE", post.points, 0, yOff, 3);
    out.push(
      "0", "TEXT", "8", "LABELS", "62", "7",
      "10", "0.0", "20", num(yOff + 40), "30", "0.0",
      "40", "1.25", "1", `CH ${s.chainage} ${cfg.chainageUnit}`,
    );
  });

  out.push("0", "ENDSEC", "0", "EOF", "");
  download(
    new Blob([out.join("\r\n")], { type: "application/dxf" }),
    `${slug(project.name)}-sections.dxf`,
  );
}

const num = (v: number) => (Number.isFinite(v) ? v.toFixed(4) : "0.0000");

/** R12 heavy POLYLINE / VERTEX / SEQEND sequence (LWPOLYLINE is R13+). */
function poly(
  out: string[],
  layer: string,
  pts: Array<{ distance: number; rl: number }>,
  xOff: number,
  yOff: number,
  color: number,
) {
  if (pts.length < 2) return;
  out.push(
    "0", "POLYLINE", "8", layer, "62", String(color),
    "66", "1", "70", "0",
    "10", "0.0", "20", "0.0", "30", "0.0",
  );
  pts.forEach((p) => {
    out.push(
      "0", "VERTEX", "8", layer,
      "10", num(p.distance + xOff), "20", num(p.rl + yOff), "30", "0.0",
    );
  });
  out.push("0", "SEQEND", "8", layer);
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export { interpAt, designLevelAt, designWidthAt };

// ---------------------------------------------------------------- chart images

const CANVAS_W = 1400;
const CANVAS_H = 560;

function newCanvas(): { cv: HTMLCanvasElement; g: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined") return null;
  const cv = document.createElement("canvas");
  cv.width = CANVAS_W;
  cv.height = CANVAS_H;
  const g = cv.getContext("2d");
  if (!g) return null;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, CANVAS_W, CANVAS_H);
  g.font = "18px Arial";
  g.textBaseline = "middle";
  return { cv, g };
}

const b64 = (cv: HTMLCanvasElement) => cv.toDataURL("image/png").split(",")[1] ?? "";

function axes(
  g: CanvasRenderingContext2D,
  title: string,
  xLabel: string,
  yLabel: string,
): { L: number; R: number; T: number; B: number } {
  const box = { L: 110, R: CANVAS_W - 40, T: 70, B: CANVAS_H - 70 };
  g.fillStyle = "#111827";
  g.font = "bold 22px Arial";
  g.fillText(title, box.L, 34);
  g.font = "16px Arial";
  g.fillText(xLabel, (box.L + box.R) / 2 - 60, CANVAS_H - 24);
  g.save();
  g.translate(28, (box.T + box.B) / 2);
  g.rotate(-Math.PI / 2);
  g.fillText(yLabel, -50, 0);
  g.restore();
  return box;
}

function grid(
  g: CanvasRenderingContext2D,
  box: { L: number; R: number; T: number; B: number },
  xTicks: Array<{ p: number; t: string }>,
  yTicks: Array<{ p: number; t: string }>,
) {
  g.strokeStyle = "#e5e7eb";
  g.lineWidth = 1;
  g.fillStyle = "#374151";
  g.font = "14px Arial";
  yTicks.forEach(({ p, t }) => {
    g.beginPath();
    g.moveTo(box.L, p);
    g.lineTo(box.R, p);
    g.stroke();
    g.textAlign = "right";
    g.fillText(t, box.L - 8, p);
  });
  xTicks.forEach(({ p, t }) => {
    g.beginPath();
    g.moveTo(p, box.T);
    g.lineTo(p, box.B);
    g.stroke();
    g.textAlign = "center";
    g.fillText(t, p, box.B + 20);
  });
  g.textAlign = "left";
  g.strokeStyle = "#9ca3af";
  g.strokeRect(box.L, box.T, box.R - box.L, box.B - box.T);
}

function legend(
  g: CanvasRenderingContext2D,
  box: { L: number; R: number; T: number; B: number },
  items: Array<{ c: string; t: string; dash?: boolean }>,
) {
  let x = box.L + 8;
  const y = box.T - 16;
  g.font = "14px Arial";
  items.forEach(({ c, t, dash }) => {
    g.strokeStyle = c;
    g.lineWidth = 3;
    g.setLineDash(dash ? [7, 5] : []);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 26, y);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = "#111827";
    g.fillText(t, x + 32, y);
    x += 42 + g.measureText(t).width;
  });
}

/** Cross-section profile chart (pre red dashed, design grey dashed, post green). */
function renderSectionChart(
  s: SectionData,
  post: SectionData | undefined,
  cfg: Project["config"],
  km: boolean,
): string {
  if (s.points.length < 2) return "";
  const made = newCanvas();
  if (!made) return "";
  const { cv, g } = made;
  const design = designProfile(s, cfg);
  const series = [
    { pts: s.points, c: "#dc2626", dash: true, t: "Pre-work RL" },
    { pts: design, c: "#6b7280", dash: true, t: "Design" },
    ...(post && post.points.length > 1
      ? [{ pts: post.points, c: "#16a34a", dash: false, t: "Post-work RL" }]
      : []),
  ];
  const all = series.flatMap((x) => x.pts);
  const xs = all.map((p) => p.distance);
  const ys = all.map((p) => p.rl);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys) - 0.5;
  const y1 = Math.max(...ys) + 0.5;

  const box = axes(
    g,
    `Cross-section at CH ${s.chainage.toFixed(3)} ${km ? "KM" : "M"}`,
    "Offset distance (m)",
    "RL (m)",
  );
  const sx = (v: number) => box.L + ((v - x0) / (x1 - x0 || 1)) * (box.R - box.L);
  const sy = (v: number) => box.B - ((v - y0) / (y1 - y0 || 1)) * (box.B - box.T);

  const xTicks = [];
  for (let i = 0; i <= 10; i++) {
    const v = x0 + ((x1 - x0) * i) / 10;
    xTicks.push({ p: sx(v), t: v.toFixed(1) });
  }
  const yTicks = [];
  for (let i = 0; i <= 8; i++) {
    const v = y0 + ((y1 - y0) * i) / 8;
    yTicks.push({ p: sy(v), t: v.toFixed(2) });
  }
  grid(g, box, xTicks, yTicks);
  legend(g, box, series.map((x) => ({ c: x.c, t: x.t, dash: x.dash })));

  series.forEach(({ pts, c, dash }) => {
    const p = [...pts].sort((a, b) => a.distance - b.distance);
    g.strokeStyle = c;
    g.lineWidth = 2.5;
    g.setLineDash(dash ? [8, 5] : []);
    g.beginPath();
    p.forEach((q, i) => (i ? g.lineTo(sx(q.distance), sy(q.rl)) : g.moveTo(sx(q.distance), sy(q.rl))));
    g.stroke();
    g.setLineDash([]);
  });
  return b64(cv);
}

/** Volume / mean-area bar+line chart along the alignment. */
function renderVolumeChart(project: Project): string {
  const cfg = project.config;
  const { rows } = abstractRows(project.pre, cfg);
  const data = rows.filter((r) => !r.spacer && r.chainage !== undefined);
  if (data.length < 2) return "";
  const made = newCanvas();
  if (!made) return "";
  const { cv, g } = made;
  const vols = data.map((r) => Math.abs(r.volume ?? 0));
  const areas = data.map((r) => r.area ?? 0);
  const vMax = Math.max(...vols, 1);
  const aMax = Math.max(...areas, 1);
  const embankment = cfg.workType === "EMBANKMENT_RESECTIONING";

  const box = axes(
    g,
    `${embankment ? "Filling" : "Cutting"} volume & area by chainage`,
    `Chainage (${cfg.chainageUnit})`,
    "Volume (m³)",
  );
  const yV = (v: number) => box.B - (v / vMax) * (box.B - box.T);
  const yA = (v: number) => box.B - (v / aMax) * (box.B - box.T);
  const step = (box.R - box.L) / data.length;

  const yTicks = [];
  for (let i = 0; i <= 8; i++) {
    const v = (vMax * i) / 8;
    yTicks.push({ p: yV(v), t: v.toFixed(0) });
  }
  grid(
    g,
    box,
    data.map((r, i) => ({ p: box.L + step * (i + 0.5), t: (r.chainage ?? 0).toFixed(3) })),
    yTicks,
  );
  legend(g, box, [
    { c: "#2563eb", t: "Volume (m³)" },
    { c: "#dc2626", t: "Area (m²)" },
    { c: "#6b7280", t: "Mean area (m²)", dash: true },
  ]);

  g.fillStyle = "#2563eb";
  data.forEach((r, i) => {
    const h = box.B - yV(Math.abs(r.volume ?? 0));
    g.fillRect(box.L + step * i + step * 0.2, box.B - h, step * 0.6, h);
  });

  const line = (get: (i: number) => number | null, c: string, dash: boolean) => {
    g.strokeStyle = c;
    g.lineWidth = 2.5;
    g.setLineDash(dash ? [8, 5] : []);
    g.beginPath();
    let started = false;
    data.forEach((_, i) => {
      const v = get(i);
      if (v === null) return;
      const x = box.L + step * (i + 0.5);
      if (started) g.lineTo(x, yA(v));
      else {
        g.moveTo(x, yA(v));
        started = true;
      }
    });
    g.stroke();
    g.setLineDash([]);
  };
  line((i) => data[i]?.area ?? null, "#dc2626", false);
  line((i) => data[i]?.meanArea ?? null, "#6b7280", true);
  return b64(cv);
}
