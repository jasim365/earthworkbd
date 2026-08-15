import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { rgbToHex } from "@/lib/earthwork/types";
import type {
  CenterLineMode,
  ControlPoint,
  ChainageUnit,
  DesignConfig,
  RgbColor,
  VaryMode,
  WorkType,
} from "@/lib/earthwork/types";

export const Route = createFileRoute("/design")({
  head: () => ({
    meta: [
      { title: "Design Section | BWDB Earthwork Estimator" },
      {
        name: "description",
        content:
          "Set BWDB design section parameters — type of work, chainage unit, C/S and R/S slopes, centre line type, design levels, widths and colour control.",
      },
      { property: "og:title", content: "Design Section | BWDB Earthwork Estimator" },
      {
        property: "og:description",
        content:
          "Configure BWDB canal excavation or embankment re-sectioning design parameters and colour control.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
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

  const patchPoint = (id: string, patch: Partial<ControlPoint>) =>
    set(
      "controlPoints",
      cfg.controlPoints.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );

  const unit = cfg.chainageUnit === "KM" ? "KM" : "M";
  const isCanal = cfg.workType === "CANAL_EXCAVATION";
  const levelLabel = isCanal ? "Design Bed Level (mSOB)" : "Design Crest Level (mSOB)";
  const widthLabel = isCanal ? "Design Bed Width (m)" : "Design Crest Width (m)";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Design Section"
        subtitle={`${project.name} — global BWDB design parameters used for every cross-section.`}
        action={<Button onClick={() => toast.success("Design section saved")}>Save</Button>}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Type of Work & Alignment</CardTitle>
            <CardDescription>Work type, chainage unit, slopes and centre line logic.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type of work</Label>
              <Select value={cfg.workType} onValueChange={(v) => set("workType", v as WorkType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CANAL_EXCAVATION">Canal Excavation</SelectItem>
                  <SelectItem value="EMBANKMENT_RESECTIONING">Embankment Re-sectioning</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Chainage in</Label>
              <Select
                value={cfg.chainageUnit}
                onValueChange={(v) => set("chainageUnit", v as ChainageUnit)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="KM">Kilometers</SelectItem>
                  <SelectItem value="M">Meters</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <NumField label="C/S Slope (1 : n)" value={cfg.csSlope} onChange={(v) => set("csSlope", v)} />
            <NumField label="R/S Slope (1 : n)" value={cfg.rsSlope} onChange={(v) => set("rsSlope", v)} />
            <div className="space-y-2 sm:col-span-2">
              <Label>Center line type</Label>
              <Select
                value={cfg.centerLineMode}
                onValueChange={(v) => set("centerLineMode", v as CenterLineMode)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MANUAL">Manual</SelectItem>
                  <SelectItem value="LOWEST_EARTH">Lowest Earth</SelectItem>
                  <SelectItem value="MIDDLE">Middle</SelectItem>
                  <SelectItem value="START_X">StartX</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Lowest Earth shifts the alignment to the minimum ground RL so overall earthwork volume
                is minimised. Per-section CL Dist. entries override this value.
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
            <CardTitle className="text-base">Design Levels & Widths</CardTitle>
            <CardDescription>
              Values are applied from the start chainage to the end chainage.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <NumField
              label={`Start chainage (${unit})`}
              value={cfg.startChainage}
              onChange={(v) => set("startChainage", v)}
              step="0.001"
            />
            <NumField
              label={`End chainage (${unit})`}
              value={cfg.endChainage}
              onChange={(v) => set("endChainage", v)}
              step="0.001"
            />
            <div className="space-y-2 sm:col-span-2">
              <Label>Level type</Label>
              <Select value={cfg.levelMode} onValueChange={(v) => set("levelMode", v as VaryMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONSTANT">Constant Level</SelectItem>
                  <SelectItem value="INTERPOLATED">Interpolated Level</SelectItem>
                  <SelectItem value="CONSTANT_AT_FIXED_LENGTH">Constant Level At Fixed Length</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <NumField
              label={`${levelLabel} — start`}
              value={cfg.levelStart}
              onChange={(v) => set("levelStart", v)}
              step="0.001"
            />
            <NumField
              label={`${levelLabel} — end`}
              value={cfg.levelEnd}
              onChange={(v) => set("levelEnd", v)}
              step="0.001"
              disabled={cfg.levelMode === "CONSTANT"}
            />
            <div className="space-y-2 sm:col-span-2">
              <Label>Width type</Label>
              <Select value={cfg.widthMode} onValueChange={(v) => set("widthMode", v as VaryMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CONSTANT">Constant Width</SelectItem>
                  <SelectItem value="INTERPOLATED">Interpolated Width</SelectItem>
                  <SelectItem value="CONSTANT_AT_FIXED_LENGTH">Constant Width At Fixed Length</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <NumField
              label={`${widthLabel} — start`}
              value={cfg.widthStart}
              onChange={(v) => set("widthStart", v)}
            />
            <NumField
              label={`${widthLabel} — end`}
              value={cfg.widthEnd}
              onChange={(v) => set("widthEnd", v)}
              disabled={cfg.widthMode === "CONSTANT"}
            />
            {(cfg.widthMode === "CONSTANT_AT_FIXED_LENGTH" ||
              cfg.levelMode === "CONSTANT_AT_FIXED_LENGTH") && (
              <NumField
                label="Fixed length (m)"
                value={cfg.fixedLength}
                onChange={(v) => set("fixedLength", v)}
              />
            )}
            <NumField label="Rate per m³ (৳)" value={cfg.rate} onChange={(v) => set("rate", v)} />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Intermediate Chainage Points</CardTitle>
            <CardDescription>
              Add middle chainages between start and end with their own design level and/or{" "}
              {isCanal ? "bed" : "crest"} width. Values interpolate piecewise between the points.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {cfg.controlPoints.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No intermediate points — levels and widths run straight from start to end.
              </p>
            )}
            {cfg.controlPoints.map((cp) => (
              <div key={cp.id} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <NumField
                  label={`Chainage (${unit})`}
                  value={cp.chainage}
                  step="0.001"
                  onChange={(v) => patchPoint(cp.id, { chainage: v })}
                />
                <OptField
                  label={`${levelLabel}`}
                  value={cp.level}
                  step="0.001"
                  onChange={(v) => patchPoint(cp.id, { level: v })}
                />
                <OptField
                  label={`${widthLabel}`}
                  value={cp.width}
                  onChange={(v) => patchPoint(cp.id, { width: v })}
                />
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Remove point"
                  onClick={() =>
                    set(
                      "controlPoints",
                      cfg.controlPoints.filter((c) => c.id !== cp.id),
                    )
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() =>
                set("controlPoints", [
                  ...cfg.controlPoints,
                  {
                    id: Math.random().toString(36).slice(2, 10),
                    chainage: (cfg.startChainage + cfg.endChainage) / 2,
                    level: cfg.levelStart,
                    width: cfg.widthStart,
                  },
                ])
              }
            >
              <Plus className="size-4" /> Add middle chainage
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Postwork Calculations</CardTitle>
            <CardDescription>Progress tracking against the post-work survey.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <p className="text-sm font-medium">Calculate Progress</p>
                <p className="text-xs text-muted-foreground">
                  Compare post-work survey against pre-work to report executed quantity.
                </p>
              </div>
              <Switch
                checked={cfg.calculateProgress}
                onCheckedChange={(v) => set("calculateProgress", v)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Color Control</CardTitle>
            <CardDescription>RGB values used for charts, drawings and exports.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RgbField label="Prework RGB" value={cfg.colorPre} onChange={(v) => set("colorPre", v)} />
            <RgbField
              label="Adjusted Postwork RGB"
              value={cfg.colorPostAdjusted}
              onChange={(v) => set("colorPostAdjusted", v)}
            />
            <RgbField
              label="Original Postwork RGB"
              value={cfg.colorPostOriginal}
              onChange={(v) => set("colorPostOriginal", v)}
            />
            <RgbField
              label="Design RGB"
              value={cfg.colorDesign}
              onChange={(v) => set("colorDesign", v)}
            />
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
  step = "0.01",
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="tabular-nums"
      />
    </div>
  );
}

function OptField({
  label,
  value,
  onChange,
  step = "0.01",
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        step={step}
        placeholder="interpolated"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className="tabular-nums"
      />
    </div>
  );
}

function RgbField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: RgbColor;
  onChange: (v: RgbColor) => void;
}) {
  const chan = (k: keyof RgbColor) => (
    <Input
      key={k}
      type="number"
      min={0}
      max={255}
      aria-label={`${label} ${k.toUpperCase()}`}
      className="h-9 w-20 tabular-nums"
      value={value[k]}
      onChange={(e) => onChange({ ...value, [k]: Number(e.target.value) })}
    />
  );
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-40 flex-1 space-y-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-2">
          <span
            className="size-9 shrink-0 rounded-md border"
            style={{ background: rgbToHex(value) }}
            aria-hidden
          />
          {chan("r")}
          {chan("g")}
          {chan("b")}
        </div>
      </div>
    </div>
  );
}
