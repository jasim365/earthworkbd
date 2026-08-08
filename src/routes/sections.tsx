import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Plus, Trash2, Upload, Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import type { Project, SectionData } from "@/lib/earthwork/types";
import { designProfile, sectionArea, fmt } from "@/lib/earthwork/calc";
import { parseSurveyCsv, mergeSections, SURVEY_CSV_TEMPLATE } from "@/lib/earthwork/csv";


export const Route = createFileRoute("/sections")({
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
  const fileRef = useRef<HTMLInputElement>(null);

  const write = (next: SectionData[]) => updateProject(project.id, { [kind]: next } as Partial<Project>);

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
    write(mergeSections(sections, imported));
    toast.success(`Imported ${rows} points across ${imported.length} chainages`, {
      description: errors.length ? `${errors.length} row(s) skipped` : undefined,
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
        <Button variant="ghost" onClick={downloadTemplate}>
          <Download className="size-4" /> Template
        </Button>
        <span className="text-xs text-muted-foreground">
          Columns: chainage ({unit}), distance (m), RL (m)
        </span>
      </div>


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
                  <Input
                    type="number"
                    step="0.001"
                    className="h-8 w-28 tabular-nums"
                    value={s.chainage}
                    onChange={(e) =>
                      write(
                        sections.map((x) =>
                          x.id === s.id ? { ...x, chainage: Number(e.target.value) } : x,
                        ),
                      )
                    }
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
