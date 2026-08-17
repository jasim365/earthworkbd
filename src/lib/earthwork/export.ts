import type { Project, SectionData } from "./types";
import { rgbToHex } from "./types";
import {
  computeVolumes,
  designLevelAt,
  designProfile,
  designWidthAt,
  interpAt,
  sectionAreas,
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
