import { Link } from "@tanstack/react-router";
import { ArrowDownToLine, ArrowUpFromLine, Scale, Rows3, Ruler, Calculator } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { computeVolumes, fmt } from "@/lib/earthwork/calc";
import type { Project } from "@/lib/earthwork/types";

/**
 * Read-only summary of the active project. All quantities come straight from
 * the protected calculation engine (computeVolumes) — nothing is recomputed here.
 */
export function ProjectSummary({ project }: { project: Project }) {
  const cfg = project.config;
  const r = computeVolumes(project.pre, cfg);
  const chs = project.pre.map((s) => s.chainage).filter(Number.isFinite);
  const range = chs.length
    ? `${Math.min(...chs).toFixed(3)} – ${Math.max(...chs).toFixed(3)} ${cfg.chainageUnit}`
    : "—";

  return (
    <Card>
      <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="truncate text-base">Active project · {project.name}</CardTitle>
          <CardDescription>Pre-work survey quantities from the existing earthwork calculator.</CardDescription>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/analysis">
            <Calculator className="size-4" /> Calculator
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard icon={ArrowDownToLine} label="Total Cut" value={`${fmt(r.cut, 2)} m³`} />
        <StatCard icon={ArrowUpFromLine} label="Total Fill" value={`${fmt(r.fill, 2)} m³`} />
        <StatCard icon={Scale} label="Net (Cut − Fill)" value={`${fmt(r.cut - r.fill, 2)} m³`} />
        <StatCard icon={Rows3} label="Sections" value={String(project.pre.length)} />
        <StatCard icon={Ruler} label="Chainage Range" value={range} />
      </CardContent>
    </Card>
  );
}
