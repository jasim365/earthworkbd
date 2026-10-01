import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Project } from "@/lib/earthwork/types";
import { computeVolumes, fmt } from "@/lib/earthwork/calc";

/** Signature of every value the volume / gap / chart pipeline depends on. */
function signature(project: Project): string {
  const dump = (kind: "pre" | "post") =>
    project[kind].map((s) => `${s.chainage}:${s.clDist ?? "-"}:[${s.points.map((p) => `${p.distance},${p.rl}`).join(";")}]`).join("|");
  return JSON.stringify([dump("pre"), dump("post"), project.config]);
}

/**
 * Realtime recalculation pill: whenever survey data or the design config
 * changes it briefly shows "recalculating…" while the mean-area volumes,
 * gap checks and charts re-derive, then confirms with fresh totals.
 */
export function RecalcStatus({ project }: { project: Project }) {
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<string | null>(null);
  const last = useRef<string | null>(null);
  const next = signature(project);

  useEffect(() => {
    if (last.current === null) {
      // First render — nothing was edited, start settled.
      last.current = next;
      setAt(new Date().toLocaleTimeString());
      return;
    }
    if (last.current === next) return;
    last.current = next;
    setBusy(true);
    const t = setTimeout(() => {
      setBusy(false);
      setAt(new Date().toLocaleTimeString());
    }, 650);
    return () => clearTimeout(t);
  }, [next]);

  const pre = computeVolumes(project.pre, project.config).total;
  const post = computeVolumes(project.post, project.config).total;

  if (busy) {
    return (
      <Badge variant="secondary" className="gap-1.5 font-normal">
        <Loader2 className="size-3 animate-spin" />
        Recalculating volumes, gaps &amp; charts…
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1.5 font-normal">
      <CheckCircle2 className="size-3 text-primary" />
      Up to date · {at} · Pre {fmt(pre)} m³ · Post {fmt(post)} m³
    </Badge>
  );
}
