import { useSyncExternalStore } from "react";
import { defaultConfig, normalizeConfig, type Project, type SectionData } from "./types";

const KEY = "ewp.projects.v1";

let projects: Project[] = [];
let loaded = false;
const listeners = new Set<() => void>();

const uid = () => Math.random().toString(36).slice(2, 10);

function seed(): Project[] {
  const mk = (chainage: number, drop: number): SectionData => ({
    id: uid(),
    chainage,
    points: [0, 4, 8, 12, 16, 20, 24].map((d, i) => ({
      id: uid(),
      distance: d,
      rl: 14 - Math.max(0, 4 - Math.abs(i - 3)) * 1.1 - drop,
    })),
  });
  const cfg = { ...defaultConfig(), bedLevel: 9.5, bedWidth: 10 };
  return [
    {
      id: uid(),
      name: "Barapukuria Main Canal — Re-sectioning",
      location: "Reach 1, Dinajpur",
      createdAt: new Date().toISOString(),
      config: cfg,
      pre: [mk(0, 0), mk(0.05, 0.2), mk(0.1, 0.35), mk(0.15, 0.5)],
      post: [mk(0, 0.55), mk(0.05, 0.6), mk(0.1, 0.62), mk(0.15, 0.68)],
    },
  ];
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Project[]) : seed();
    projects = (Array.isArray(parsed) ? parsed : seed()).map((p) => ({
      ...p,
      config: normalizeConfig((p.config ?? {}) as never),
    }));
  } catch {
    projects = seed();
  }
  persist();
}

function persist() {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(projects));
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
}

const EMPTY: Project[] = [];

export function useProjects(): Project[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      load();
      return projects;
    },
    () => EMPTY,
  );
}

export function useProject(id: string | undefined): Project | undefined {
  return useProjects().find((p) => p.id === id);
}

export function createProject(name: string, location: string): Project {
  load();
  const p: Project = {
    id: uid(),
    name,
    location,
    createdAt: new Date().toISOString(),
    config: defaultConfig(),
    pre: [],
    post: [],
  };
  projects = [...projects, p];
  persist();
  return p;
}

export function updateProject(id: string, patch: Partial<Project>) {
  load();
  projects = projects.map((p) => (p.id === id ? { ...p, ...patch } : p));
  persist();
}

export function deleteProject(id: string) {
  load();
  projects = projects.filter((p) => p.id !== id);
  persist();
}

export function newSection(chainage: number): SectionData {
  return {
    id: uid(),
    chainage,
    points: [0, 5, 10, 15, 20].map((d) => ({ id: uid(), distance: d, rl: 12 })),
  };
}

export function newPoint(distance = 0, rl = 0) {
  return { id: uid(), distance, rl };
}

const ACTIVE_KEY = "ewp.active.v1";
let activeId: string | null = null;
let activeLoaded = false;

function loadActive() {
  if (activeLoaded || typeof window === "undefined") return;
  activeLoaded = true;
  activeId = window.localStorage.getItem(ACTIVE_KEY);
}

export function setActiveProject(id: string) {
  loadActive();
  activeId = id;
  if (typeof window !== "undefined") window.localStorage.setItem(ACTIVE_KEY, id);
  listeners.forEach((l) => l());
}

export function useActiveProject(): Project | undefined {
  const all = useProjects();
  const id = useSyncExternalStore(
    subscribe,
    () => {
      loadActive();
      return activeId;
    },
    () => null,
  );
  return all.find((p) => p.id === id) ?? all[0];
}
