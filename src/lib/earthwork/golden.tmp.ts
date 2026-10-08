import { computeVolumes, abstractRows, projectStats } from "./calc";
import { defaultConfig } from "./types";
import { DEMO_PRE_CSV, DEMO_POST_CSV } from "./demo-data";
import { parseSurveyCsv } from "./csv";
const pre = parseSurveyCsv(DEMO_PRE_CSV).sections, post = parseSurveyCsv(DEMO_POST_CSV).sections;
const out: Record<string, unknown> = {};
for (const workType of ["CANAL_EXCAVATION","EMBANKMENT_RESECTIONING"] as const)
 for (const centerLineMode of ["MANUAL","MIDDLE","LOWEST_EARTH"] as const) {
  const config = { ...defaultConfig(), bedLevel: 9.5, bedWidth: 10, workType, centerLineMode };
  const p = { id:"x", name:"x", location:"", createdAt:"", config, pre, post } as any;
  out[`${workType}/${centerLineMode}`] = { pre: computeVolumes(pre, config).total, post: computeVolumes(post, config).total, abs: abstractRows(pre, config).total, stats: projectStats(p) };
 }
console.log(JSON.stringify(out));
