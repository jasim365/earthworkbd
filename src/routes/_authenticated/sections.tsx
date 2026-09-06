import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import {
  Plus,
  Trash2,
  Upload,
  Download,
  FileSpreadsheet,
  Copy,
  ClipboardPaste,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { NoProject } from "@/components/no-project";
import { useActiveProject, updateProject, newSection, newPoint } from "@/lib/earthwork/store";
import type { Project, SectionData, SurveyPoint } from "@/lib/earthwork/types";
import { designProfile, sectionArea, fmt } from "@/lib/earthwork/calc";
import { parseSurveyCsv, mergeSections, SURVEY_CSV_TEMPLATE } from "@/lib/earthwork/csv";
import { parseChartDatasetsWorkbook, type ImportIssue } from "@/lib/earthwork/xlsx-import";
import {
  DEMO_PRE_CSV,
  DEMO_POST_CSV,
  downloadDemoWorkbook,
  downloadText,
  parseSurveySheetsWorkbook,
} from "@/lib/earthwork/demo-data";




export const Route = createFileRoute("/_authenticated/sections")({
  head: () => ({
    meta: [
      { title: "Sectional Data | Earthwork Estimation Pro" },
      {
        name: "description",
        content:
          "Enter pre-work and post-work survey data — chainage, distance and reduced level — in editable data grids.",
      },
      { property: "og:title", content: "Sectional Data | Earthwork Estimation Pro" },
      {
        property: "og:description",
        content: "Editable survey data grids for pre-work and post-work canal cross-sections.",
      },
    ],
  }),
  component: SectionsPage,
});

function SectionsPage() {
  const project = useActiveProject();
  if (!project) return <NoProject />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sectional Data"
        subtitle={`${project.name} — survey points per chainage (distance & reduced level in metres).`}
      />
      <Tabs defaultValue="pre">
        <TabsList>
          <TabsTrigger value="pre">Pre-work Survey</TabsTrigger>
          <TabsTrigger value="post">Post-work Survey</TabsTrigger>
        </TabsList>
        <TabsContent value="pre" className="mt-4">
          <SectionEditor project={project} kind="pre" />
        </TabsContent>
        <TabsContent value="post" className="mt-4">
          <SectionEditor project={project} kind="post" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SectionEditor({ project, kind }: { project: Project; kind: "pre" | "post" }) {
  const sections = project[kind];
  const unit = project.config.chainageUnit;
  const [nextCh, setNextCh] = useState("");
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const xlsxRef = useRef<HTMLInputElement>(null);


  const write = (next: SectionData[]) => updateProject(project.id, { [kind]: next } as Partial<Project>);

  // Used after paste/import: sorts chainages and offsets and drops unusable rows
  // so gap handling, mean-area volumes and the charts recalculate immediately.
  const writeImported = (next: SectionData[]) => write(normaliseSections(next));

  const addSection = () => {
    const ch = Number(nextCh);
    if (!Number.isFinite(ch) || nextCh.trim() === "") {
      toast.error("Enter a valid chainage");
      return;
    }
    write([...sections, newSection(ch)].sort((a, b) => a.chainage - b.chainage));
    setNextCh("");
  };

  const onImport = async (file: File) => {
    const text = await file.text();
    const { sections: imported, rows, errors } = parseSurveyCsv(text);
    if (imported.length === 0) {
      toast.error("No valid rows found", { description: errors[0] });
      return;
    }
    writeImported(mergeSections(sections, imported));
    toast.success(`Imported ${rows} points across ${imported.length} chainages`, {
      description: errors.length ? `${errors.length} row(s) skipped` : undefined,
    });
  };

  const onImportWorkbook = async (file: File) => {
    setIssues([]);

    // 1) Simple "Pre" / "Post" survey sheets (the demo template).
    try {
      const simple = await parseSurveySheetsWorkbook(file);
      if (simple && (simple.pre.length || simple.post.length)) {
        const patch: Partial<Project> = {};
        if (simple.pre.length) patch.pre = mergeSections(project.pre, simple.pre);
        if (simple.post.length) patch.post = mergeSections(project.post, simple.post);
        updateProject(project.id, patch);
        setIssues(
          simple.errors.map((message) => ({ severity: "warning" as const, where: file.name, message })),
        );
        toast.success("Survey template imported — charts and volumes recalculated", {
          description: `${simple.pre.length} pre-work and ${simple.post.length} post-work chainages`,
        });
        return;
      }
    } catch {
      /* fall through to the Chart_Datasets parser */
    }

    // 2) Chart_Datasets round-trip workbook.
    let res: Awaited<ReturnType<typeof parseChartDatasetsWorkbook>>;
    try {
      res = await parseChartDatasetsWorkbook(file);
    } catch {
      setIssues([
        { severity: "error", where: file.name, message: "Unexpected error while reading the workbook." },
      ]);
      toast.error("Could not read that workbook");
      return;
    }
    setIssues(res.issues);
    const errorCount = res.issues.filter((i) => i.severity === "error").length;

    if (!res.ok) {
      toast.error("Import failed", {
        description: res.errors[0] ?? "No valid X-Y values found in Chart_Datasets.",
      });
      return;
    }

    const patch: Partial<Project> = {};
    if (res.pre.length) patch.pre = mergeSections(project.pre, res.pre);
    if (res.post.length) patch.post = mergeSections(project.post, res.post);
    updateProject(project.id, patch);
    toast.success(`Imported ${res.points} points — charts and volumes recalculated`, {
      description:
        `${res.pre.length} pre-work and ${res.post.length} post-work chainages updated` +
        (errorCount ? ` · ${errorCount} cell(s) skipped` : ""),
    });
  };


  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([SURVEY_CSV_TEMPLATE], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `survey-template-${kind}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadDemo = () => {
    updateProject(project.id, {
      pre: mergeSections(project.pre, parseSurveyCsv(DEMO_PRE_CSV).sections),
      post: mergeSections(project.post, parseSurveyCsv(DEMO_POST_CSV).sections),
      config: {
        ...project.config,
        workType: "CANAL_EXCAVATION",
        chainageUnit: "KM",
        centerLineMode: "MIDDLE",
        startChainage: 0,
        endChainage: 2.25,
        levelMode: "INTERPOLATED",
        levelStart: 11.0,
        levelEnd: 10.6,
        widthMode: "INTERPOLATED",
        widthStart: 4.5,
        widthEnd: 6.0,
      },
    });
    toast.success("Demo pre & post survey data loaded", {
      description: "Design section set to match the demo alignment (CH 0.000 – 2.250 KM)",
    });
  };





  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-48"
          placeholder={`New chainage (${unit})`}
          value={nextCh}
          onChange={(e) => setNextCh(e.target.value)}
        />
        <Button onClick={addSection}>
          <Plus className="size-4" /> Add section
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = "";
          }}
        />
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" /> Import CSV
        </Button>
        <input
          ref={xlsxRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportWorkbook(f);
            e.target.value = "";
          }}
        />
        <Button variant="outline" onClick={() => xlsxRef.current?.click()}>
          <FileSpreadsheet className="size-4" /> Import Excel
        </Button>
        <PasteSurveyDialog
          kind={kind}
          unit={unit}
          onApply={(text) => {
            const { sections: imported, rows, errors } = parseSurveyCsv(text);
            if (imported.length === 0) {
              toast.error("Nothing to paste", {
                description: errors[0] ?? "Expected three columns: chainage, distance, RL",
              });
              return false;
            }
            writeImported(mergeSections(sections, imported));
            toast.success(`Pasted ${rows} points across ${imported.length} chainages`, {
              description: errors.length ? `${errors.length} row(s) skipped` : undefined,
            });
            return true;
          }}
        />
        <Button
          variant="ghost"
          onClick={() => {
            const tsv = sections
              .flatMap((s) => s.points.map((p) => `${s.chainage}\t${p.distance}\t${p.rl}`))
              .join("\n");
            if (!tsv) {
              toast.error("No survey data to copy");
              return;
            }
            void copyText(`Chainage\tDistance\tRL\n${tsv}`);
          }}
        >
          <Copy className="size-4" /> Copy all
        </Button>
        <Button variant="ghost" onClick={downloadTemplate}>
          <Download className="size-4" /> Template
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            downloadDemoWorkbook()
              .then(() => toast.success("Demo Excel template downloaded"))
              .catch((e) => toast.error("Download failed", { description: String(e) }))
          }
        >
          <FileSpreadsheet className="size-4" /> Demo Excel
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            downloadText("demo-pre-survey.csv", DEMO_PRE_CSV);
            downloadText("demo-post-survey.csv", DEMO_POST_CSV);
            toast.success("Demo pre & post CSV files downloaded");
          }}
        >
          <Download className="size-4" /> Demo CSV
        </Button>
        <Button variant="secondary" onClick={loadDemo}>
          Load demo data
        </Button>

        <span className="text-xs text-muted-foreground">
          Columns: chainage ({unit}), distance (m), RL (m)
        </span>

      </div>

      {issues.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">
              Workbook check —{" "}
              {issues.filter((i) => i.severity === "error").length} error(s),{" "}
              {issues.filter((i) => i.severity === "warning").length} warning(s)
            </CardTitle>
            <Button size="sm" variant="ghost" onClick={() => setIssues([])}>
              Dismiss
            </Button>
          </CardHeader>
          <CardContent className="max-h-64 space-y-2 overflow-auto text-sm">
            {issues.map((i, k) => (
              <div key={k} className="flex items-start gap-2">
                <Badge variant={i.severity === "error" ? "destructive" : "secondary"}>
                  {i.severity}
                </Badge>
                <span className="font-mono text-xs text-muted-foreground">{i.where}</span>
                <span className="flex-1">{i.message}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}




      {sections.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No {kind}-work sections yet.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {sections.map((s) => {
          const area = sectionArea(s.points, designProfile(s, project.config));
          return (
            <Card key={s.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">
                    CH {s.chainage} {unit}
                  </CardTitle>
                  {s.points.length < 2 ? (
                    <Badge variant="destructive">Empty / gap</Badge>
                  ) : (
                    <Badge variant="secondary">{fmt(area)} m²</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">CH</span>
                  <Input
                    type="number"
                    step="0.001"
                    aria-label="Chainage"
                    className="h-8 w-24 tabular-nums"
                    value={s.chainage}
                    onChange={(e) =>
                      write(
                        sections.map((x) =>
                          x.id === s.id ? { ...x, chainage: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                  <span className="text-xs text-muted-foreground">CL Dist.</span>
                  <Input
                    type="number"
                    step="0.01"
                    aria-label="Center line distance"
                    placeholder="auto"
                    className="h-8 w-24 tabular-nums"
                    value={s.clDist ?? ""}
                    onChange={(e) =>
                      write(
                        sections.map((x) => {
                          if (x.id !== s.id) return x;
                          const next: SectionData = { ...x };
                          if (e.target.value === "") delete next.clDist;
                          else next.clDist = Number(e.target.value);
                          return next;
                        }),
                      )
                    }
                  />


                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Copy offset and RL"
                    title="Copy offset & RL"
                    onClick={() => {
                      if (s.points.length === 0) {
                        toast.error("This section has no points to copy");
                        return;
                      }
                      void copyText(
                        `Distance\tRL\n` +
                          s.points.map((p) => `${p.distance}\t${p.rl}`).join("\n"),
                      );
                    }}
                  >
                    <Copy className="size-4" />
                  </Button>
                  <PastePointsDialog
                    chainage={s.chainage}
                    unit={unit}
                    onApply={(text, mode) => {
                      const { points, errors } = parsePointPairs(text);
                      if (points.length === 0) {
                        toast.error("Nothing to paste", {
                          description:
                            errors[0] ?? "Expected two columns: distance (offset) and RL",
                        });
                        return false;
                      }
                      writeImported(
                        sections.map((x) =>
                          x.id === s.id
                            ? {
                                ...x,
                                points: mode === "replace" ? points : [...x.points, ...points],
                              }
                            : x,
                        ),
                      );
                      toast.success(`Pasted ${points.length} points at CH ${s.chainage} ${unit}`, {
                        description: errors.length ? `${errors.length} row(s) skipped` : undefined,
                      });
                      return true;
                    }}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Delete section"
                    onClick={() => write(sections.filter((x) => x.id !== s.id))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">#</TableHead>
                      <TableHead>Distance (m)</TableHead>
                      <TableHead>RL (m)</TableHead>
                      <TableHead className="w-12" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.points.map((p, i) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8 tabular-nums"
                            value={p.distance}
                            onChange={(e) =>
                              write(
                                sections.map((x) =>
                                  x.id === s.id
                                    ? {
                                        ...x,
                                        points: x.points.map((q) =>
                                          q.id === p.id
                                            ? { ...q, distance: Number(e.target.value) }
                                            : q,
                                        ),
                                      }
                                    : x,
                                ),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8 tabular-nums"
                            value={p.rl}
                            onChange={(e) =>
                              write(
                                sections.map((x) =>
                                  x.id === s.id
                                    ? {
                                        ...x,
                                        points: x.points.map((q) =>
                                          q.id === p.id ? { ...q, rl: Number(e.target.value) } : q,
                                        ),
                                      }
                                    : x,
                                ),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Delete point"
                            onClick={() =>
                              write(
                                sections.map((x) =>
                                  x.id === s.id
                                    ? { ...x, points: x.points.filter((q) => q.id !== p.id) }
                                    : x,
                                ),
                              )
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={() =>
                    write(
                      sections.map((x) =>
                        x.id === s.id
                          ? {
                              ...x,
                              points: [
                                ...x.points,
                                newPoint(
                                  (x.points[x.points.length - 1]?.distance ?? 0) + 5,
                                  x.points[x.points.length - 1]?.rl ?? 10,
                                ),
                              ],
                            }
                          : x,
                      ),
                    )
                  }
                >
                  <Plus className="size-4" /> Add point
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/** Copy text to the clipboard with a graceful fallback for older browsers. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard — paste straight into Excel");
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) toast.success("Copied to clipboard");
    else toast.error("Could not access the clipboard");
  }
}

/** Parse pasted Excel cells with two columns: distance (offset) and RL. */
function parsePointPairs(text: string): { points: SurveyPoint[]; errors: string[] } {
  const errors: string[] = [];
  const points: SurveyPoint[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  lines.forEach((line, i) => {
    const cols = line.split(/[,;\t]+/).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 2) {
      errors.push(`Line ${i + 1}: expected 2 columns (distance, RL)`);
      return;
    }
    const d = Number(cols[0]);
    const r = Number(cols[1]);
    if (!Number.isFinite(d) || !Number.isFinite(r)) {
      if (i > 0 || points.length > 0) errors.push(`Line ${i + 1}: values are not numbers`);
      return; // header row or malformed
    }
    points.push({ ...newPoint(d, r) });
  });

  return { points, errors };
}

function PastePointsDialog({
  chainage,
  unit,
  onApply,
}: {
  chainage: number;
  unit: string;
  onApply: (text: string, mode: "replace" | "append") => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"replace" | "append">("replace");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setText("");
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Paste offset and RL" title="Paste offset & RL">
          <ClipboardPaste className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Paste offset & RL — CH {chainage} {unit}
          </DialogTitle>
          <DialogDescription>
            Copy two columns in Excel (distance/offset in m, RL in m) and paste them below. A header
            row is ignored.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            rows={10}
            className="font-mono text-xs"
            placeholder={"0\t12.40\n5\t11.85\n10\t11.20"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "replace"}
                onChange={() => setMode("replace")}
              />
              Replace existing points
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === "append"} onChange={() => setMode("append")} />
              Add to existing points
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!text.trim()}
            onClick={() => {
              if (onApply(text, mode)) {
                setText("");
                setOpen(false);
              }
            }}
          >
            Paste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PasteSurveyDialog({
  kind,
  unit,
  onApply,
}: {
  kind: "pre" | "post";
  unit: string;
  onApply: (text: string) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setText("");
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <ClipboardPaste className="size-4" /> Paste from Excel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Paste {kind === "pre" ? "pre-work" : "post-work"} survey</DialogTitle>
          <DialogDescription>
            Copy three columns in Excel — chainage ({unit}), distance/offset (m) and RL (m) — then
            paste them here. A header row is ignored.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor={`paste-${kind}`}>Excel cells</Label>
          <Textarea
            id={`paste-${kind}`}
            rows={10}
            className="font-mono text-xs"
            placeholder={"0.000\t0\t12.40\n0.000\t5\t11.85\n0.050\t0\t12.30"}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button
            disabled={!text.trim()}
            onClick={() => {
              if (onApply(text)) {
                setText("");
                setOpen(false);
              }
            }}
          >
            Paste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
