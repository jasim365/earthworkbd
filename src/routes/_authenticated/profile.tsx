import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { NoProject } from "@/components/no-project";
import { PageHeader } from "@/components/page-header";
import { LongitudinalProfileChart } from "@/components/longitudinal-profile-chart";
import { longitudinalPoints } from "@/lib/earthwork/longitudinal";
import { useActiveProject } from "@/lib/earthwork/store";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [
    { title: "Longitudinal Profile | EarthworkBD" },
    { name: "description", content: "View existing ground levels at the selected centre line and formation levels along your project chainage with interactive longitudinal profile charts." },
    { property: "og:title", content: "Longitudinal Profile | EarthworkBD" },
    { property: "og:description", content: "Existing ground and formation RL against chainage, using EarthworkBD project data with tooltips and zoom." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: LongitudinalProfilePage,
});

function LongitudinalProfilePage() {
  const project = useActiveProject();
  const points = useMemo(() => project ? longitudinalPoints(project) : [], [project]);
  if (!project) return <NoProject />;
  const missing = points.filter((p) => p.groundRL === null).length;
  return <div className="space-y-6">
    <PageHeader title="Longitudinal Profile" subtitle={project.name} />
    {points.length === 0 ? <p className="text-sm text-muted-foreground">No survey chainages available in this project.</p> : <>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span>CH {points[0]?.chainage}–{points[points.length - 1]?.chainage} {project.config.chainageUnit}</span>
        <span>Formation: {project.config.workType === "CANAL_EXCAVATION" ? "Bed RL" : "Crest RL"}</span>
      </div>
      {missing > 0 && <p className="text-sm text-muted-foreground">Existing ground RL is unavailable at {missing} chainage{missing === 1 ? "" : "s"}; missing levels are not plotted.</p>}
      <LongitudinalProfileChart key={project.id} points={points} unit={project.config.chainageUnit} />
    </>}
  </div>;
}