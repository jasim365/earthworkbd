import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Area,
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
import { Badge } from "@/components/ui/badge";
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
import { CrossSectionCanvas } from "@/components/cross-section-canvas";
import { useActiveProject } from "@/lib/earthwork/store";
import { designProfile, sectionAreas, interpAt, resolvedCenterLine, fmt } from "@/lib/earthwork/calc";
import { rgbToHex } from "@/lib/earthwork/types";

export const Route = createFileRoute("/_authenticated/visualization")({
  head: () => ({
    meta: [
      { title: "Cross-Section Charts | BWDB Earthwork Estimator" },
      {
        name: "description",
        content:
          "Interactive XY cross-section plotter showing pre-work, design and post-work profiles with shaded cut and fill regions.",
      },
      { property: "og:title", content: "Cross-Section Charts | BWDB Earthwork Estimator" },
      {
        property: "og:description",
        content: "Plot pre-work, design and post-work profiles with cut/fill shading per chainage.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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
  const design = pre ? designProfile(pre, cfg) : [];
  const centerLine = pre ? resolvedCenterLine(pre, cfg) : null;
  const areas = pre ? sectionAreas(pre.points, design) : { cut: 0, fill: 0, net: 0 };

  const preColor = rgbToHex(cfg.colorPre);
  const postColor = rgbToHex(cfg.colorPostAdjusted);
  const designColor = rgbToHex(cfg.colorDesign);

  const distances = Array.from(
    new Set([
      ...(pre?.points ?? []).map((p) => p.distance),
      ...(post?.points ?? []).map((p) => p.distance),
      ...design.map((p) => p.distance),
    ]),
  ).sort((a, b) => a - b);

  const data = distances.map((d) => {
    const g = interpAt(pre?.points ?? [], d);
    const dz = interpAt(design, d);
    const cutRange = g !== null && dz !== null && g > dz ? [dz, g] : null;
    const fillRange = g !== null && dz !== null && dz > g ? [g, dz] : null;
    return {
      distance: d,
      pre: g ?? undefined,
      post: interpAt(post?.points ?? [], d) ?? undefined,
      design: dz ?? undefined,
      cutRange,
      fillRange,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cross-Section Charts"
        subtitle="XY plot of pre-work ground, design template and post-work profiles with cut / fill shading."
      />
      <div className="flex flex-wrap items-end gap-4">
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
        <div className="flex gap-2">
          <Badge variant="secondary">Cut {fmt(areas.cut)} m²</Badge>
          {!cfg.cutOnly && <Badge variant="secondary">Fill {fmt(areas.fill)} m²</Badge>}
          <Badge>{cfg.cutOnly ? `Quantity ${fmt(areas.cut)} m²` : `Net ${fmt(areas.net)} m²`}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {pre ? `Section at CH ${pre.chainage} ${cfg.chainageUnit}` : "No section"}
          </CardTitle>
          <CardDescription>
            {pre
              ? "X = offset distance (m), Y = reduced level (mSOB)."
              : "Add pre-work sections to plot cross-sections."}
          </CardDescription>
        </CardHeader>
        <CardContent className="h-[440px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 32, left: 0 }}>
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
                label={{ value: "RL (mSOB)", angle: -90, position: "insideLeft", fontSize: 12 }}
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
              <Area
                dataKey="cutRange"
                name="Cut"
                stroke="none"
                fill={preColor}
                fillOpacity={0.18}
                connectNulls={false}
                isAnimationActive={false}
                activeDot={false}
              />
              <Area
                dataKey="fillRange"
                name="Fill"
                stroke="none"
                fill={postColor}
                fillOpacity={0.18}
                connectNulls={false}
                isAnimationActive={false}
                activeDot={false}
              />
              <Line
                type="linear"
                dataKey="pre"
                name="Pre-work"
                stroke={preColor}
                strokeWidth={2}
                connectNulls
                isAnimationActive={false}
                dot={{ r: 3 }}
              />
              <Line
                type="linear"
                dataKey="design"
                name="Design"
                stroke={designColor}
                strokeWidth={2}
                strokeDasharray="6 4"
                connectNulls
                isAnimationActive={false}
                dot={false}
              />
              {cfg.calculateProgress && (
                <Line
                  type="linear"
                  dataKey="post"
                  name="Post-work"
                  stroke={postColor}
                  strokeWidth={2}
                  connectNulls
                  isAnimationActive={false}
                  dot={{ r: 3 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Interactive Canvas Cross-Section</CardTitle>
          <CardDescription>
            1 m RL grid and 5 m offset grid — red dashed = pre-work RL, green solid = post-work RL,
            grey dashed = design template, violet dotted = selected centre line
            {cfg.centerLineMode === "LOWEST_EARTH" ? " (lowest-earth optimum)" : ""}. Hover to read levels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CrossSectionCanvas
            pre={pre?.points ?? []}
            post={post?.points ?? []}
            design={design}
            centerLine={centerLine}
            centerLineLabel={cfg.centerLineMode === "LOWEST_EARTH" ? "CL (lowest earth)" : "CL"}
          />
        </CardContent>
      </Card>

    </div>
  );
}
