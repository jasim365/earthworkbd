import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Plus,
  MapPin,
  Trash2,
  ArrowRight,
  Layers,
  Ruler,
  TrendingUp,
  Wallet,
  Pencil,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import {
  useProjects,
  createProject,
  deleteProject,
  setActiveProject,
  updateProject,
} from "@/lib/earthwork/store";
import { projectStats, fmt } from "@/lib/earthwork/calc";
import type { Project, WorkType } from "@/lib/earthwork/types";

const WORK_TYPE_LABEL: Record<WorkType, string> = {
  CANAL_EXCAVATION: "Canal Excavation",
  EMBANKMENT_RESECTIONING: "Re-sectioning",
};

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard | Earthwork Estimation Pro" },
      {
        name: "description",
        content:
          "Manage canal and embankment re-sectioning projects with mean-area earthwork volumes, progress and cost estimates.",
      },
      { property: "og:title", content: "Dashboard | Earthwork Estimation Pro" },
      {
        property: "og:description",
        content: "Canal & embankment earthwork estimation dashboard with mean-area volume analysis.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const projects = useProjects();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [workType, setWorkType] = useState<WorkType>("EMBANKMENT_RESECTIONING");

  const totals = projects.reduce(
    (acc, p) => {
      const s = projectStats(p);
      acc.pre += s.preVolume;
      acc.cost += s.cost;
      acc.progress += s.progress;
      acc.sections += s.sections;
      return acc;
    },
    { pre: 0, cost: 0, progress: 0, sections: 0 },
  );
  const avgProgress = projects.length ? totals.progress / projects.length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Dashboard"
        subtitle="Overview of all canal & embankment earthwork estimation projects."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> New Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create project</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pname">Project name</Label>
                  <Input
                    id="pname"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Teesta Left Bank Canal — Reach 2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ploc">Location</Label>
                  <Input
                    id="ploc"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="District / Reach"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type of work</Label>
                  <Select value={workType} onValueChange={(v) => setWorkType(v as WorkType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CANAL_EXCAVATION">Canal Excavation</SelectItem>
                      <SelectItem value="EMBANKMENT_RESECTIONING">
                        Embankment Re-sectioning
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!name.trim()}
                  onClick={() => {
                    const p = createProject(name.trim(), location.trim() || "—");
                    updateProject(p.id, { config: { ...p.config, workType } });
                    setActiveProject(p.id);
                    setName("");
                    setLocation("");
                    setWorkType("EMBANKMENT_RESECTIONING");
                    setOpen(false);
                  }}
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Layers} label="Projects" value={String(projects.length)} />
        <StatCard icon={Ruler} label="Estimated Volume" value={`${fmt(totals.pre, 0)} m³`} />
        <StatCard icon={TrendingUp} label="Avg. Progress" value={`${fmt(avgProgress, 1)}%`} />
        <StatCard icon={Wallet} label="Executed Cost" value={`৳ ${fmt(totals.cost, 0)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {projects.map((p) => {
          const s = projectStats(p);
          return (
            <Card key={p.id} className="transition-shadow hover:shadow-md">
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{p.name}</CardTitle>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3" /> {p.location}
                  </p>
                </div>
                <Badge variant="secondary">{WORK_TYPE_LABEL[p.config.workType]}</Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <Field label="Pre-work Vol." value={`${fmt(s.preVolume, 0)} m³`} />
                  <Field label="Remaining" value={`${fmt(s.remaining, 0)} m³`} />
                  <Field label="Sections" value={String(s.sections)} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>{fmt(s.progress, 1)}%</span>
                  </div>
                  <Progress value={s.progress} />
                </div>
                <div className="flex gap-2">
                  <Button asChild size="sm" onClick={() => setActiveProject(p.id)}>
                    <Link to="/design">
                      Open <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteProject(p.id)}
                    aria-label="Delete project"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {projects.length === 0 && (
          <Card className="lg:col-span-2">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No projects yet — create your first earthwork project to begin.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}
