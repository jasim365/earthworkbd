import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/page-header";
import { NoProject } from "@/components/no-project";
import { useActiveProject } from "@/lib/earthwork/store";
import { designProfile, sectionArea, interpAt, fmt } from "@/lib/earthwork/calc";

export const Route = createFileRoute("/visualization")({
  head: () => ({
    meta: [
      { title: "Cross-Section Visualization | Earthwork Estimation Pro" },
      {
        name: "description",
        content:
          "Plot pre-work, design and post-work canal cross-section profiles on an interactive X-Y chart.",
      },
      { property: "og:title", content: "Cross-Section Visualization | Earthwork Estimation Pro" },
      {
        property: "og:description",
        content: "Interactive cross-section plots of pre-work, design and post-work profiles.",
      },
    ],
  }),
  component: VisualizationPage,
});

function VisualizationPage() {
  const project = useActiveProject();
  const [idx, setIdx] = useState("0");
  if (!project) return <NoProject />;

  const i = Number(idx);
  const pre = project.pre[i];
  const post = project.post[i];
  const cfg = project.config;
  const design = pre ? designProfile(pre.points, cfg) : [];

  const distances = Array.from(
    new Set([
      ...(pre?.points ?? []).map((p) => p.distance),
      ...(post?.points ?? []).map((p) => p.distance),
      ...design.map((p) => p.distance),
    ]),
  ).sort((a, b) => a - b);

  const data = distances.map((d) => ({
    distance: d,
    pre: interpAt(pre?.points ?? [], d) ?? undefined,
    post: interpAt(post?.points ?? [], d) ?? undefined,
    design: interpAt(design, d) ?? undefined,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cross-Section Visualization"
        subtitle="Pre-work ground, design template and post-work ground profiles."
      />
      <div className="w-64 space-y-2">
        <Label>Chainage</Label>
        <Select value={idx} onValueChange={setIdx}>
          <SelectTrigger>
            <SelectValue placeholder="Select chainage" />
          </SelectTrigger>
          <SelectContent>
            {project.pre.map((s, n) => (
              <SelectItem key={s.id} value={String(n)}>
                CH {s.chainage} {cfg.chainageUnit}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {pre ? `Section at CH ${pre.chainage} ${cfg.chainageUnit}` : "No section"}
          </CardTitle>
          <CardDescription>
            {pre
              ? `Cut area vs design: ${fmt(sectionArea(pre.points, design))} m²`
              : "Add pre-work sections to plot cross-sections."}
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 20, bottom: 32, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="distance"
                type="number"
                domain={["dataMin", "dataMax"]}
                tick={{ fontSize: 12 }}
                label={{ value: "Distance (m)", position: "insideBottom", offset: -10, fontSize: 12 }}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                domain={["auto", "auto"]}
                label={{ value: "RL (m)", angle: -90, position: "insideLeft", fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Legend />
              <Line
                type="linear"
                dataKey="pre"
                name="Pre-work"
                stroke="var(--color-chart-1)"
                strokeWidth={2}
                connectNulls
                isAnimationActive={false}
                dot={{ r: 3 }}
              />
              <Line
                type="linear"
                dataKey="design"
                name="Design"
                stroke="var(--color-chart-2)"
                strokeWidth={2}
                strokeDasharray="6 4"
                connectNulls
                isAnimationActive={false}
                dot={false}
              />
              <Line
                type="linear"
                dataKey="post"
                name="Post-work"
                stroke="var(--color-chart-3)"
                strokeWidth={2}
                connectNulls
                isAnimationActive={false}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
