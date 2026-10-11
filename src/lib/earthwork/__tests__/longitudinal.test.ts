// @ts-nocheck -- bun test runtime module
import { expect, test } from "bun:test";
import { longitudinalPoints } from "../longitudinal";
import { centerLineRows } from "../calc";
import { defaultConfig } from "../types";

const project = {
  id: "profile", name: "Profile", location: "", createdAt: "",
  config: { ...defaultConfig(), centerLineMode: "MANUAL", manualCenterLine: 5,
    startChainage: 0, endChainage: 1, levelStart: 10, levelEnd: 12, controlPoints: [] },
  pre: [{ id: "s", chainage: 0, points: [
    { id: "a", distance: 0, rl: 12 }, { id: "b", distance: 10, rl: 14 },
  ] }],
  post: [{ id: "post", chainage: 1, points: [
    { id: "c", distance: 0, rl: 8 }, { id: "d", distance: 10, rl: 9 },
  ] }],
};

test("longitudinal ground and formation levels match existing engine results", () => {
  const before = JSON.stringify(project);
  const actual = longitudinalPoints(project)[0];
  const expected = centerLineRows(project.pre, project.config)[0];
  expect(actual.groundRL).toBe(expected.groundRL);
  expect(actual.formationRL).toBe(expected.designRL);
  expect(actual.centerLine).toBe(expected.centerLine);
  expect(JSON.stringify(project)).toBe(before);
});

test("post-work-only chainages never invent existing ground levels", () => {
  const point = longitudinalPoints(project).find((p) => p.chainage === 1);
  expect(point.groundRL).toBeNull();
  expect(point.formationRL).toBe(12);
});

test("empty surveys do not create invented profile chainages", () => {
  expect(longitudinalPoints({ ...project, pre: [], post: [] })).toEqual([]);
});