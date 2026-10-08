// Regression lock for the PROTECTED earthwork calculation engine (calc.ts).
// Baseline captured from the engine before the structure/safety refactor.
// If this fails, the calculation output changed — that requires explicit user approval.
import { expect, test } from "bun:test";
import { computeVolumes, abstractRows, projectStats } from "../calc";
import { defaultConfig, type Project } from "../types";
import { DEMO_PRE_CSV, DEMO_POST_CSV } from "../demo-data";
import { parseSurveyCsv } from "../csv";
import baseline from "./calc-baseline.json";

const pre = parseSurveyCsv(DEMO_PRE_CSV).sections;
const post = parseSurveyCsv(DEMO_POST_CSV).sections;

for (const workType of ["CANAL_EXCAVATION", "EMBANKMENT_RESECTIONING"] as const)
  for (const centerLineMode of ["MANUAL", "MIDDLE", "LOWEST_EARTH"] as const)
    test(`identical quantities: ${workType}/${centerLineMode}`, () => {
      const config = { ...defaultConfig(), bedLevel: 9.5, bedWidth: 10, workType, centerLineMode };
      const p = { id: "x", name: "x", location: "", createdAt: "", config, pre, post } as Project;
      const actual = {
        pre: computeVolumes(pre, config).total,
        post: computeVolumes(post, config).total,
        abs: abstractRows(pre, config).total,
        stats: projectStats(p),
      };
      expect(actual).toEqual((baseline as Record<string, unknown>)[`${workType}/${centerLineMode}`]);
    });
