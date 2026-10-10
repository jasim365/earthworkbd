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
import { designProfile, designLevelAt, designWidthAt, sectionAreas, interpAt, resolvedCenterLine, fmt } from "@/lib/earthwork/calc";
import { rgbToHex } from "@/lib/earthwork/types";

export const Route = createFileRoute("/_authenticated/visualization")({
  head: () => ({
    meta: [
      { title: "Cross-Section Charts | BWDB Earthwork Estimator" },
      {
        name: "description",
        content:
          "Explore EarthworkBD cross-sections by chainage with ground and design profiles, RL, cut/fill results, zoom, pan and PNG export.",
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
  const [selectedChainage, setSelectedChainage] = useState<string | null>(null);
  if (!project) return <NoProject />;

  const chainages = Array.from(new Set([...project.pre, ...project.post].map((s) => s.chainage))).filter(Number.isFinite).sort((a, b) => a - b);
  const chainage = chainages.find((ch) => String(ch) === selectedChainage) ?? chainages[0];
  const pre = project.pre.find((s) => s.chainage === chainage);
  const post = project.post.find((s) => s.chainage === chainage);
  const reference = pre ?? post;
  const cfg = project.config;
  const design = reference ? designProfile(reference, cfg) : [];
  const centerLine = reference ? resolvedCenterLine(reference, cfg) : null;
  const areas = pre ? sectionAreas(pre.points, design) : { cut: 0, fill: 0, net: 0 };

  const width = chainage !== undefined ? designWidthAt(chainage, cfg) : undefined;
  const level = chainage !== undefined ? designLevelAt(chainage, cfg) : undefined;

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
        subtitle={project.name}
      />
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-64 space-y-2">
          <Label htmlFor="chainage-select">Chainage</Label>
          <Select value={chainage !== undefined ? String(chainage) : ""} onValueChange={setSelectedChainage} disabled={!chainages.length}>
            <SelectTrigger id="chainage-select">
              <SelectValue placeholder="Select chainage" />
            </SelectTrigger>
            <SelectContent>
              {chainages.map((ch) => (
                <SelectItem key={ch} value={String(ch)}>
                  CH {ch} {cfg.chainageUnit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Cut {pre ? fmt(areas.cut) : "—"} m²</Badge>
          <Badge variant="secondary">Fill {pre ? fmt(areas.fill) : "—"} m²</Badge>
          <Badge variant="outline">{cfg.workType === "CANAL_EXCAVATION" ? "Bed" : "Crest"} width {width !== undefined ? fmt(width) : "—"} m</Badge>
          <Badge variant="outline">Design RL {level !== undefined ? fmt(level, 3) : "—"} mSOB</Badge>
          <Badge variant="outline">CL offset {centerLine !== null ? fmt(centerLine) : "—"} m</Badge>
          <Badge variant="outline">Ground CL RL {centerLine !== null ? (interpAt(pre?.points ?? [], centerLine)?.toFixed(3) ?? "—") : "—"}</Badge>
        </div>
      </div>

      <section className="space-y-3" aria-label="Interactive cross-section">
        {!pre && post && <p className="text-sm text-muted-foreground">Pre-work survey unavailable at this chainage; cut and fill areas are unavailable.</p>}
        <CrossSectionCanvas
          key={`${project.id}:${chainage}`}
          pre={pre?.points ?? []}
          post={post?.points ?? []}
          design={design}
          centerLine={centerLine}
          centerLineLabel={cfg.centerLineMode === "LOWEST_EARTH" ? "CL (lowest earth)" : "CL"}
          title={chainage !== undefined ? `CH ${chainage} ${cfg.chainageUnit} · ${project.name}` : project.name}
          designWidth={width}
          designLevel={level}
          cutArea={pre ? areas.cut : undefined}
          fillArea={pre ? areas.fill : undefined}
          colors={{ pre: cfg.colorPre, post: cfg.colorPostAdjusted, design: cfg.colorDesign }}
        />
      </section>

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



    </div>
  );
}
