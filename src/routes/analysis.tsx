import { createFileRoute } from "@tanstack/react-router";
import { Ruler, TrendingUp, Wallet, Layers } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { NoProject } from "@/components/no-project";
import { useActiveProject } from "@/lib/earthwork/store";
import { computeVolumes, projectStats, fmt } from "@/lib/earthwork/calc";
import type { Project } from "@/lib/earthwork/types";

export const Route = createFileRoute("/analysis")({
  head: () => ({
    meta: [
      { title: "Analysis Engine | Earthwork Estimation Pro" },
      {
        name: "description",
        content:
          "Mean-area earthwork volume analysis between chainages with automatic gap detection and progress tracking.",
      },
      { property: "og:title", content: "Analysis Engine | Earthwork Estimation Pro" },
      {
        property: "og:description",
        content: "Mean-area volume computation, gap handling and pre vs post progress analysis.",
      },
    ],
  }),
  component: AnalysisPage,
});

function AnalysisPage() {
  const project = useActiveProject();
  if (!project) return <NoProject />;
  const stats = projectStats(project);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analysis Engine"
        subtitle="Volume = Mean Area × Distance. Disconnected or empty chainages are excluded from interpolation."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Ruler} label="Pre-work Volume" value={`${fmt(stats.preVolume, 0)} m³`} />
        <StatCard icon={Layers} label="Post-work Volume" value={`${fmt(stats.postVolume, 0)} m³`} />
        <StatCard icon={TrendingUp} label="Progress" value={`${fmt(stats.progress, 1)}%`} />
        <StatCard icon={Wallet} label="Executed Cost" value={`৳ ${fmt(stats.cost, 0)}`} />
      </div>

      <Tabs defaultValue="pre">
        <TabsList>
          <TabsTrigger value="pre">Pre-work</TabsTrigger>
          <TabsTrigger value="post">Post-work</TabsTrigger>
        </TabsList>
        <TabsContent value="pre" className="mt-4">
          <SegmentTable project={project} kind="pre" />
        </TabsContent>
        <TabsContent value="post" className="mt-4">
          <SegmentTable project={project} kind="post" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SegmentTable({ project, kind }: { project: Project; kind: "pre" | "post" }) {
  const { segments, total } = computeVolumes(project[kind], project.config);
  const unit = project.config.chainageUnit;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Mean-area computation</CardTitle>
        <CardDescription>
          {segments.length} segment(s) — total {fmt(total, 2)} m³
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>From (CH {unit})</TableHead>
              <TableHead>To (CH {unit})</TableHead>
              <TableHead className="text-right">Distance (m)</TableHead>
              <TableHead className="text-right">Area₁ (m²)</TableHead>
              <TableHead className="text-right">Area₂ (m²)</TableHead>
              <TableHead className="text-right">Mean Area (m²)</TableHead>
              <TableHead className="text-right">Volume (m³)</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {segments.map((s, i) => (
              <TableRow key={i}>
                <TableCell className="tabular-nums">{s.fromChainage}</TableCell>
                <TableCell className="tabular-nums">{s.toChainage}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(s.distance)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(s.areaFrom)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(s.areaTo)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(s.meanArea)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmt(s.volume)}</TableCell>
                <TableCell>
                  {s.gap ? <Badge variant="destructive">Gap skipped</Badge> : <Badge variant="secondary">OK</Badge>}
                </TableCell>
              </TableRow>
            ))}
            {segments.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  Add at least two chainages to compute volumes.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
