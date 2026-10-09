import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardPaste, FileSpreadsheet, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ControlPoint, SectionData } from "@/lib/earthwork/types";
import type { ImportIssue } from "@/lib/earthwork/xlsx-import";
import { parseChartDatasetsWorkbook } from "@/lib/earthwork/xlsx-import";
import {
  FIELDS,
  applyMapping,
  guessMapping,
  parseDelimited,
  readWorkbookTables,
  type FieldKey,
  type Mapping,
  type MappedResult,
  type Table,
} from "@/lib/earthwork/tabular-import";

export interface ImportPatch {
  pre?: SectionData[];
  post?: SectionData[];
  controlPoints?: ControlPoint[];
}

const NONE = "__none";

/**
 * Guided import: upload / drop / paste a table, preview it, map its columns to the
 * existing calculator inputs, validate, then hand the data to the existing engine.
 */
export function ImportSurveyDialog({
  kind,
  unit,
  onApply,
}: {
  kind: "pre" | "post";
  unit: string;
  onApply: (patch: ImportPatch, issues: ImportIssue[], label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<"pre" | "post">(kind);
  const [sheets, setSheets] = useState<Record<string, Table>>({});
  const [sheet, setSheet] = useState("");
  const [table, setTable] = useState<Table | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [chart, setChart] = useState<MappedResult | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [fatal, setFatal] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setSheets({});
    setSheet("");
    setTable(null);
    setMapping({});
    setChart(null);
    setLabel("");
    setFatal("");
    setPasteText("");
    setBusy(false);
  };

  const useTable = (t: Table, l: string) => {
    setChart(null);
    setFatal(t.rows.length ? "" : "The table has no data rows.");
    setTable(t);
    setMapping(guessMapping(t));
    setLabel(l);
  };

  const pickSheet = (name: string, all = sheets) => {
    setSheet(name);
    const t = all[name];
    if (t) useTable(t, name);
    if (/^pre/i.test(name)) setTarget("pre");
    if (/^post/i.test(name)) setTarget("post");
  };

  const parseFile = async (file: File) => {
    setBusy(true);
    reset();
    setBusy(true);
    try {
      if (/\.(csv|txt|tsv)$/i.test(file.name)) {
        useTable(parseDelimited(await file.text()), file.name);
        return;
      }
      if (!/\.xlsx$/i.test(file.name)) {
        setFatal(`"${file.name}" is not an .xlsx or .csv file.`);
        return;
      }
      const all = await readWorkbookTables(file);
      const names = Object.keys(all);
      if (names.some((n) => n.trim().toLowerCase() === "chart_datasets")) {
        const r = await parseChartDatasetsWorkbook(file);
        setLabel(file.name);
        setChart({ pre: r.pre, post: r.post, controlPoints: [], validRows: r.points, issues: r.issues });
        if (!r.ok) setFatal(r.errors[0] ?? "No valid data in Chart_Datasets.");
        return;
      }
      const usable = names.filter((n) => all[n]!.rows.length > 0);
      if (!usable.length) {
        setFatal("The workbook has no sheet with data.");
        return;
      }
      setSheets(all);
      pickSheet(usable.find((n) => new RegExp(`^${kind}`, "i").test(n)) ?? usable[0]!, all);
    } catch {
      setFatal("The file could not be opened — it may be corrupt or in another format.");
    } finally {
      setBusy(false);
    }
  };

  const result: MappedResult | null = useMemo(
    () => chart ?? (table && table.rows.length ? applyMapping(table, mapping, target) : null),
    [chart, table, mapping, target],
  );
  const errors = result?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = result?.issues.filter((i) => i.severity === "warning") ?? [];
  const mappingError = errors.some((e) => e.where === "Mapping");
  const sections = (result?.pre.length ?? 0) + (result?.post.length ?? 0);
  const canApply = !!result && !fatal && !mappingError && sections > 0 && !busy;

  const commit = () => {
    if (!result || !canApply) return;
    const patch: ImportPatch = {};
    if (result.pre.length) patch.pre = result.pre;
    if (result.post.length) patch.post = result.post;
    if (result.controlPoints.length) patch.controlPoints = result.controlPoints;
    onApply(patch, result.issues, label || "pasted data");
    reset();
    setOpen(false);
  };

  const setField = (k: FieldKey, v: string) =>
    setMapping((m) => {
      const n = { ...m };
      if (v === NONE) delete n[k];
      else n[k] = Number(v);
      return n;
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileSpreadsheet className="size-4" /> Import Excel / CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import survey data</DialogTitle>
          <DialogDescription>
            Upload or drop an Excel / CSV file, or paste cells from Excel. Check the preview, match
            each column to a calculator field, then import.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="file">
          <TabsList>
            <TabsTrigger value="file">
              <Upload className="mr-1.5 size-3.5" /> Upload file
            </TabsTrigger>
            <TabsTrigger value="paste">
              <ClipboardPaste className="mr-1.5 size-3.5" /> Paste data
            </TabsTrigger>
          </TabsList>
          <TabsContent value="file" className="mt-3">
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void parseFile(f);
              }}
              className={`flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed p-4 text-center text-sm transition-colors ${
                dragging ? "border-primary bg-accent/60" : "border-border hover:bg-accent/40"
              }`}
            >
              <Upload className="size-5 text-muted-foreground" />
              <p>{busy ? "Reading the file…" : label || "Drop a .xlsx or .csv file here, or click to browse"}</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void parseFile(f);
                e.target.value = "";
              }}
            />
          </TabsContent>
          <TabsContent value="paste" className="mt-3">
            <Textarea
              rows={6}
              className="font-mono text-xs"
              placeholder={`Chainage\tOffset\tRL\n0.000\t0\t12.40\n0.000\t5\t11.85`}
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                useTable(parseDelimited(e.target.value), "pasted cells");
              }}
            />
          </TabsContent>
        </Tabs>

        {fatal && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
            <AlertTriangle className="size-4" /> {fatal}
          </div>
        )}

        {table && !chart && table.rows.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {Object.keys(sheets).length > 1 && (
                <>
                  <span className="text-muted-foreground">Sheet</span>
                  <Select value={sheet} onValueChange={(v) => pickSheet(v)}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.keys(sheets).map((n) => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
              <span className="text-muted-foreground">Import into</span>
              <Select value={target} onValueChange={(v) => setTarget(v as "pre" | "post")}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre">Pre-work survey</SelectItem>
                  <SelectItem value="post">Post-work survey</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Preview — first {Math.min(table.rows.length, 6)} of {table.rows.length} rows
              </p>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      {table.headers.map((h, i) => (
                        <th key={i} className="px-2 py-1 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.slice(0, 6).map((r, i) => (
                      <tr key={i} className="border-t">
                        {r.map((c, j) => (
                          <td key={j} className="px-2 py-1 font-mono tabular-nums">{c}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Column mapping (chainage in {unit}; offsets &amp; RLs in metres)
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <label key={f.key} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      {f.label}
                      {f.required && <span className="text-destructive"> *</span>}
                    </span>
                    <Select
                      value={mapping[f.key] === undefined ? NONE : String(mapping[f.key])}
                      onValueChange={(v) => setField(f.key, v)}
                    >
                      <SelectTrigger className="h-8 w-40" aria-label={`Column for ${f.label}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>— not used —</SelectItem>
                        {table.headers.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Side slopes and other design settings stay on the Design page — they apply to the whole project.
              </p>
            </div>
          </div>
        )}

        {result && !fatal && (
          <div className="rounded-md border bg-card p-3 text-sm">
            {!mappingError && sections > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" />
                <span>
                  Ready: <strong>{result.validRows}</strong> rows · Pre {result.pre.length} / Post{" "}
                  {result.post.length} chainage(s)
                  {result.controlPoints.length > 0 && ` · ${result.controlPoints.length} design point(s)`}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-4" />
                <span>{errors[0]?.message ?? "Nothing valid to import."}</span>
              </div>
            )}
            {(errors.length > 0 || warnings.length > 0) && (
              <>
                <Badge variant={errors.length ? "destructive" : "secondary"} className="mt-2">
                  {errors.length} error(s) skipped, {warnings.length} warning(s)
                </Badge>
                <ul className="mt-2 max-h-32 space-y-1 overflow-auto text-xs">
                  {result.issues.slice(0, 30).map((i, k) => (
                    <li key={k} className="flex items-start gap-1.5">
                      <Badge variant={i.severity === "error" ? "destructive" : "secondary"} className="px-1.5">
                        {i.severity}
                      </Badge>
                      <span className="font-mono text-muted-foreground">{i.where}</span>
                      <span className="flex-1">{i.message}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); setOpen(false); }}>Cancel</Button>
          <Button disabled={!canApply} onClick={commit}>
            Import {sections > 0 ? `${sections} chainage(s)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
