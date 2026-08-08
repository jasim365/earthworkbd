import { createFileRoute } from "@tanstack/react-router";
import { Printer, Download, FileSpreadsheet, PenTool } from "lucide-react";
import { toast } from "sonner";
import { exportWorkbook, exportDxf } from "@/lib/earthwork/export";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useActiveProject } from "@/lib/earthwork/store";
import { computeVolumes, projectStats, fmt } from "@/lib/earthwork/calc";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Estimate Reports | Earthwork Estimation Pro" },
      {
        name: "description",
        content:
          "Printable abstract and detailed earthwork estimate reports with quantities, rates and amounts.",
      },
      { property: "og:title", content: "Estimate Reports | Earthwork Estimation Pro" },
      {
        property: "og:description",
        content: "Abstract and detailed earthwork estimate tables, printable or exportable as CSV.",
      },
    ],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const project = useActiveProject();
  if (!project) return <NoProject />;

  const cfg = project.config;
  const { segments, total } = computeVolumes(project.pre, cfg);
  const stats = projectStats(project);

  const exportCsv = () => {
    const rows = [
      ["From", "To", "Distance (m)", "Mean Area (m2)", "Volume (m3)", "Amount"],
      ...segments.map((s) => [
        s.fromChainage,
        s.toChainage,
        s.distance.toFixed(2),
        s.meanArea.toFixed(3),
        s.volume.toFixed(3),
        (s.volume * cfg.rate).toFixed(2),
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, "-")}-estimate.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estimate Reports"
        subtitle={`${project.name} — ${project.location}`}
        action={
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" /> CSV
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                exportWorkbook(project)
                  .then(() => toast.success("BWDB Excel workbook exported"))
                  .catch((e) => toast.error("Excel export failed", { description: String(e) }))
              }
            >
              <FileSpreadsheet className="size-4" /> Excel (BWDB)
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                exportDxf(project);
                toast.success("DXF drawing exported");
              }}
            >
              <PenTool className="size-4" /> DXF
            </Button>
            <Button onClick={() => window.print()}>
              <Printer className="size-4" /> Print
            </Button>
          </div>

        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Abstract Estimate</CardTitle>
          <CardDescription>Summary of earthwork quantities and cost.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Sl.</TableHead>
                <TableHead>Description of item</TableHead>
                <TableHead className="text-right">Quantity (m³)</TableHead>
                <TableHead className="text-right">Rate (৳)</TableHead>
                <TableHead className="text-right">Amount (৳)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>1</TableCell>
                <TableCell>Earthwork in re-sectioning of canal as per design section</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(total)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(cfg.rate)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(total * cfg.rate)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>2</TableCell>
                <TableCell>Work executed to date (pre vs post survey)</TableCell>
                <TableCell className="text-right tabular-nums">
                  {fmt(Math.max(stats.preVolume - stats.postVolume, 0))}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmt(cfg.rate)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(stats.cost)}</TableCell>
              </TableRow>
              <TableRow className="font-semibold">
                <TableCell colSpan={4}>Total estimated amount</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(total * cfg.rate)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detailed Estimate</CardTitle>
          <CardDescription>Chainage-wise mean-area quantities.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>From (CH {cfg.chainageUnit})</TableHead>
                <TableHead>To (CH {cfg.chainageUnit})</TableHead>
                <TableHead className="text-right">Length (m)</TableHead>
                <TableHead className="text-right">Mean Area (m²)</TableHead>
                <TableHead className="text-right">Quantity (m³)</TableHead>
                <TableHead className="text-right">Amount (৳)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segments.map((s, i) => (
                <TableRow key={i}>
                  <TableCell className="tabular-nums">{s.fromChainage}</TableCell>
                  <TableCell className="tabular-nums">{s.toChainage}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(s.distance)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(s.meanArea)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(s.volume)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(s.volume * cfg.rate)}</TableCell>
                </TableRow>
              ))}
              {segments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No computed segments yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
