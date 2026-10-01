import { useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SectionData } from "@/lib/earthwork/types";
import type { ImportIssue } from "@/lib/earthwork/xlsx-import";
import { parseSurveyCsv } from "@/lib/earthwork/csv";
import { parseSurveySheetsWorkbook } from "@/lib/earthwork/demo-data";
import { parseChartDatasetsWorkbook } from "@/lib/earthwork/xlsx-import";

export interface ImportPatch {
  pre?: SectionData[];
  post?: SectionData[];
}

interface Parsed {
  ok: boolean;
  pre: SectionData[];
  post: SectionData[];
  rows: number;
  errors: string[];
  issues: ImportIssue[];
  /** whether the file itself carried Pre/Post sheets */
  hasSheets: boolean;
}

type Target = "pre" | "post" | "both";

/**
 * Guided Excel/CSV import flow for pre- and post-work survey data:
 * upload a workbook (or paste copied cells), review what was parsed and
 * any validation issues, then apply everything in one go.
 */
export function ImportSurveyDialog({
  kind,
  unit,
  onApply,
}: {
  kind: "pre" | "post";
  unit: string;
  onApply: (patch: ImportPatch, issues: ImportIssue[], fileLabel: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target>(kind);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [busy, setBusy] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setParsed(null);
    setPasteText("");
    setFileName("");
    setBusy(false);
  };

  const applyParsed = (p: Parsed, label: string) => {
    setParsed(p);
    setFileName(label);
  };

  const parseCsvText = (text: string, label: string) => {
    const { sections, rows, errors } = parseSurveyCsv(text);
    applyParsed(
      {
        ok: sections.length > 0,
        pre: target !== "post" ? sections : [],
        post: target === "post" ? sections : [],
        rows,
        errors,
        issues: errors.map((message) => ({ severity: "error" as const, where: label, message })),
        hasSheets: false,
      },
      label,
    );
  };

  const parseFile = async (file: File) => {
    setBusy(true);
    try {
      if (/\.csv$/i.test(file.name)) {
        parseCsvText(await file.text(), file.name);
      } else {
        // 1) Simple "Pre" / "Post" survey sheets
        try {
          const simple = await parseSurveySheetsWorkbook(file);
          if (simple && (simple.pre.length || simple.post.length)) {
            applyParsed(
              {
                ok: true,
                pre: simple.pre,
                post: simple.post,
                rows: simple.pre.length + simple.post.length,
                errors: [],
                issues: simple.errors.map((message) => ({
                  severity: "warning" as const,
                  where: file.name,
                  message,
                })),
                hasSheets: true,
              },
              file.name,
            );
            return;
          }
        } catch {
          /* fall through to Chart_Datasets */
        }
        // 2) Chart_Datasets round-trip workbook
        try {
          const res = await parseChartDatasetsWorkbook(file);
          applyParsed(
            {
              ok: res.ok,
              pre: res.pre,
              post: res.post,
              rows: res.points,
              errors: res.errors,
              issues: res.issues,
              hasSheets: true,
            },
            file.name,
          );
        } catch {
          applyParsed(
            {
              ok: false,
              pre: [],
              post: [],
              rows: 0,
              errors: ["Unexpected error while reading the workbook."],
              issues: [
                { severity: "error", where: file.name, message: "Unexpected error while reading the workbook." },
              ],
              hasSheets: false,
            },
            file.name,
          );
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const commit = () => {
    if (!parsed?.ok) return;
    const patch: ImportPatch = {};
    if (parsed.hasSheets) {
      if (target !== "post" && parsed.pre.length) patch.pre = parsed.pre;
      if (target !== "pre" && parsed.post.length) patch.post = parsed.post;
    } else {
      if (target !== "post" && parsed.pre.length) patch.pre = parsed.pre;
      if (target === "post" && parsed.post.length) patch.post = parsed.post;
    }
    if (Object.keys(patch).length === 0) {
      setParsed({ ...parsed, ok: false, errors: ["Nothing matched the selected target — check the target selector."] });
      return;
    }
    onApply(patch, parsed.issues, fileName || "pasted data");
    reset();
    setOpen(false);
  };

  const errorCount = parsed?.issues.filter((i) => i.severity === "error").length ?? 0;
  const warnCount = parsed?.issues.filter((i) => i.severity === "warning").length ?? 0;
  const totalSections = (parsed?.pre.length ?? 0) + (parsed?.post.length ?? 0);

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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import survey data</DialogTitle>
          <DialogDescription>
            Upload an Excel workbook or CSV file, or paste copied Excel cells — many chainages and
            rows at once. Review the check below before applying.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">Import into</span>
          <Select value={target} onValueChange={(v) => setTarget(v as Target)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pre">Pre-work survey</SelectItem>
              <SelectItem value="post">Post-work survey</SelectItem>
              <SelectItem value="both">Auto — Pre &amp; Post sheets</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            Chainage column in {unit}; offsets &amp; RLs in metres.
          </span>
        </div>

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
              className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed p-4 text-center text-sm transition-colors ${
                dragging ? "border-primary bg-accent/60" : "border-border hover:bg-accent/40"
              }`}
            >
              <Upload className="size-5 text-muted-foreground" />
              <p>
                {busy
                  ? "Reading the file…"
                  : fileName
                    ? fileName
                    : "Drop a .xlsx or .csv file here, or click to browse"}
              </p>
              <p className="text-xs text-muted-foreground">
                Excel: sheets named “Pre”/“Post”, or an exported Chart_Datasets workbook.
              </p>
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
              rows={9}
              className="font-mono text-xs"
              placeholder={`chainage (${unit}), distance (m), RL (m)\n0.000\t0\t12.40\n0.000\t5\t11.85\n0.050\t0\t12.30`}
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                parseCsvText(e.target.value, "pasted cells");
              }}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Copy three columns straight from Excel — a header row is ignored. Tab, comma or
              semicolon separated.
            </p>
          </TabsContent>
        </Tabs>

        {parsed && (
          <div className="rounded-md border bg-card p-3 text-sm">
            {parsed.ok && totalSections > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <CheckCircle2 className="size-4 text-primary" />
                <span>
                  Parsed <strong>{totalSections}</strong> chainage(s) · <strong>{parsed.rows}</strong>{" "}
                  data row(s)
                </span>
                {parsed.hasSheets && (
                  <span className="text-xs text-muted-foreground">
                    (Pre: {parsed.pre.length}, Post: {parsed.post.length})
                  </span>
                )}
                {errorCount + warnCount > 0 && (
                  <Badge variant={errorCount ? "destructive" : "secondary"}>
                    {errorCount} error(s), {warnCount} warning(s)
                  </Badge>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-4" />
                <span>{parsed.errors[0] ?? "Nothing valid found in the selected source."}</span>
              </div>
            )}
            {parsed.issues.length > 0 && (
              <ul className="mt-2 max-h-28 space-y-1 overflow-auto text-xs">
                {parsed.issues.slice(0, 6).map((i, k) => (
                  <li key={k} className="flex items-start gap-1.5">
                    <Badge variant={i.severity === "error" ? "destructive" : "secondary"} className="px-1.5">
                      {i.severity}
                    </Badge>
                    <span className="font-mono text-muted-foreground">{i.where}</span>
                    <span className="flex-1">{i.message}</span>
                  </li>
                ))}
                {parsed.issues.length > 6 && (
                  <li className="text-muted-foreground">…and {parsed.issues.length - 6} more</li>
                )}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => { reset(); setOpen(false); }}>
            Cancel
          </Button>
          <Button disabled={!parsed?.ok || totalSections === 0 || busy} onClick={commit}>
            Import {totalSections > 0 ? `${totalSections} chainage(s)` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
