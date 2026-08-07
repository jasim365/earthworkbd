import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { NoProject } from "@/components/no-project";
import { useActiveProject, updateProject } from "@/lib/earthwork/store";
import type { CenterLineMode, ChainageUnit, DesignConfig } from "@/lib/earthwork/types";

export const Route = createFileRoute("/design")({
  head: () => ({
    meta: [
      { title: "Design Configuration | Earthwork Estimation Pro" },
      {
        name: "description",
        content:
          "Configure project type, chainage unit, centre-line logic and design levels for canal re-sectioning estimates.",
      },
      { property: "og:title", content: "Design Configuration | Earthwork Estimation Pro" },
      {
        property: "og:description",
        content: "Set chainage units, centre-line logic and design levels for earthwork estimation.",
      },
    ],
  }),
  component: DesignPage,
});

function DesignPage() {
  const project = useActiveProject();
  if (!project) return <NoProject />;
  const cfg = project.config;

  const set = <K extends keyof DesignConfig>(key: K, value: DesignConfig[K]) =>
    updateProject(project.id, { config: { ...cfg, [key]: value } });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Design Configuration"
        subtitle={`${project.name} — define the design template used for volume computation.`}
        action={<Button onClick={() => toast.success("Configuration saved")}>Save</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Setup</CardTitle>
            <CardDescription>Type, units and centre-line derivation logic.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Project type</Label>
              <Select value={cfg.projectType} onValueChange={() => undefined}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RE_SECTIONING">Re-sectioning</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Chainage unit</Label>
              <Select
                value={cfg.chainageUnit}
                onValueChange={(v) => set("chainageUnit", v as ChainageUnit)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KM">Kilometre (KM)</SelectItem>
                  <SelectItem value="M">Metre (M)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Centre line calculation</Label>
              <Select
                value={cfg.centerLineMode}
                onValueChange={(v) => set("centerLineMode", v as CenterLineMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANUAL">Manual offset</SelectItem>
                  <SelectItem value="LOWEST_EARTH">Lowest earth (min RL)</SelectItem>
                  <SelectItem value="MIDDLE">Middle of section</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Determines the offset about which the design template is placed.
              </p>
            </div>
            {cfg.centerLineMode === "MANUAL" && (
              <NumField
                label="Manual centre line (m)"
                value={cfg.manualCenterLine}
                onChange={(v) => set("manualCenterLine", v)}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Design Levels & Template</CardTitle>
            <CardDescription>Geometry used to build each design cross-section.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <NumField label="Design bed level (m RL)" value={cfg.bedLevel} onChange={(v) => set("bedLevel", v)} />
            <NumField label="Bed width (m)" value={cfg.bedWidth} onChange={(v) => set("bedWidth", v)} />
            <NumField label="Side slope (H : 1V)" value={cfg.sideSlope} onChange={(v) => set("sideSlope", v)} />
            <NumField label="Berm / top width (m)" value={cfg.topWidth} onChange={(v) => set("topWidth", v)} />
            <NumField label="Rate per m³ (৳)" value={cfg.rate} onChange={(v) => set("rate", v)} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="tabular-nums"
      />
    </div>
  );
}
