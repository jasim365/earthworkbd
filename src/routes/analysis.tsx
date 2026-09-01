import { createFileRoute } from "@tanstack/react-router";
import { Ruler, TrendingUp, Wallet, Layers } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { abstractRows, projectStats, fmt } from "@/lib/earthwork/calc";
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
  const embankment = project.config.workType === "EMBANKMENT_RESECTIONING";
  const quantityLabel = embankment ? "Filling Volume" : "Cutting Volume";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analysis Engine"
        subtitle={`Volume = Mean Area × Distance. ${
          embankment
            ? "Embankment re-sectioning — filling earth area and volume only."
            : "Canal excavation — cutting area and volume only."
        }`}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Ruler} label={`Pre-work ${quantityLabel}`} value={`${fmt(stats.preVolume, 0)} m³`} />
        <StatCard icon={Layers} label="Post-work Volume" value={`${fmt(stats.postVolume, 0)} m³`} />
        <StatCard icon={TrendingUp} label="Progress" value={`${fmt(stats.progress, 1)}%`} />
        <StatCard icon={Wallet} label="Executed Cost" value={`৳ ${fmt(stats.cost, 0)}`} />
      </div>

      <Tabs defaultValue="pre">
        <TabsList>
          <TabsTrigger value="pre">Pre-work</TabsTrigger>
          <TabsTrigger value="post">Post-work</TabsTrigger>
        </TabsList>
        <TabsContent value="pre" className="mt-4 space-y-6">
          <MeanAreaTable project={project} kind="pre" />
          <MeanAreaChart project={project} kind="pre" />
        </TabsContent>
        <TabsContent value="post" className="mt-4 space-y-6">
          <MeanAreaTable project={project} kind="post" />
          <MeanAreaChart project={project} kind="post" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MeanAreaTable({ project, kind }: { project: Project; kind: "pre" | "post" }) {
  const cfg = project.config;
  const { rows, total } = abstractRows(project[kind], cfg);
  const embankment = cfg.workType === "EMBANKMENT_RESECTIONING";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Mean-area computation —{" "}
          {embankment ? "Filling (Embankment Re-sectioning)" : "Cutting (Canal Excavation)"}
        </CardTitle>
        <CardDescription>
          Mean Area = (Area_prev + Area_curr) / 2 · Dist. = ΔCh ×{" "}
          {cfg.chainageUnit === "KM" ? "1000" : "1"} · Volume = Mean Area × Dist.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center">C/S No.</TableHead>
              <TableHead className="text-center">Ch. in {cfg.chainageUnit}.</TableHead>
              <TableHead className="text-center">Area in Sqm</TableHead>
              <TableHead className="text-center">Mean Area</TableHead>
              <TableHead className="text-center">Dist. in m.</TableHead>
              <TableHead className="text-center">Volume of E/W in Cum.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) =>
              r.spacer ? (
                <TableRow key={`s${i}`}>
                  <TableCell colSpan={6} className="h-4 p-0" />
                </TableRow>
              ) : (
                <TableRow key={i}>
                  <TableCell className="text-center tabular-nums">{r.no}</TableCell>
                  <TableCell className="text-center tabular-nums">{r.chainage?.toFixed(3)}</TableCell>
                  <TableCell className="text-center tabular-nums">{fmt(r.area ?? 0, 3)}</TableCell>
                  <TableCell className="text-center tabular-nums">
                    {r.meanArea === undefined ? "" : fmt(r.meanArea, 3)}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {r.distance === undefined ? "" : fmt(Math.abs(r.distance), 2)}
                  </TableCell>
                  <TableCell className="text-center tabular-nums">
                    {r.volume === undefined ? "" : `${fmt(Math.abs(r.volume), 2)} Cum`}
                  </TableCell>
                </TableRow>
              ),
            )}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Add at least two chainages to compute volumes.
                </TableCell>
              </TableRow>
            ) : (
              <TableRow>
                <TableCell colSpan={4} />
                <TableCell className="text-right font-medium">Total=</TableCell>
                <TableCell className="text-center font-semibold tabular-nums">
                  {fmt(Math.abs(total), 2)} Cum
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function MeanAreaChart({ project, kind }: { project: Project; kind: "pre" | "post" }) {
  const cfg = project.config;
  const { rows } = abstractRows(project[kind], cfg);
  const embankment = cfg.workType === "EMBANKMENT_RESECTIONING";
  let running = 0;
  const data = rows
    .filter((r) => !r.spacer)
    .map((r) => {
      running += Math.abs(r.volume ?? 0);
      return {
        ch: r.chainage,
        area: Number((r.area ?? 0).toFixed(3)),
        meanArea: r.meanArea === undefined ? null : Number(r.meanArea.toFixed(3)),
        volume: Number(Math.abs(r.volume ?? 0).toFixed(2)),
        cumulative: Number(running.toFixed(2)),
      };
    });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {embankment ? "Filling" : "Cutting"} area &amp; volume chart
        </CardTitle>
        <CardDescription>Per-section area, mean area, volume and cumulative earthwork.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="ch"
                tick={{ fontSize: 11 }}
                label={{
                  value: `Chainage (${cfg.chainageUnit})`,
                  position: "insideBottom",
                  offset: -12,
                  fontSize: 11,
                }}
              />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => fmt(Number(v))} />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="volume"
                name="Volume (m³)"
                fill="hsl(var(--primary))"
                isAnimationActive={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="area"
                name="Area (m²)"
                stroke="hsl(var(--destructive))"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="meanArea"
                name="Mean area (m²)"
                stroke="hsl(var(--primary))"
                strokeDasharray="4 3"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="cumulative"
                name="Cumulative volume (m³)"
                stroke="hsl(var(--muted-foreground))"
                strokeDasharray="5 5"
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        {data.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Add at least two chainages to plot the calculation.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
