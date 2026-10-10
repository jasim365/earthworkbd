import { useEffect, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { Download, Maximize, Minus, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { interpAt } from "@/lib/earthwork/calc";
import { rgbToHex, type RgbColor, type SurveyPoint } from "@/lib/earthwork/types";

interface Props {
  pre: SurveyPoint[];
  post: SurveyPoint[];
  design: SurveyPoint[];
  centerLine?: number | null;
  centerLineLabel?: string;
  vStep?: number;
  hStep?: number;
  height?: number;
  title?: string;
  designWidth?: number;
  designLevel?: number;
  cutArea?: number;
  fillArea?: number;
  colors?: { pre: RgbColor; post: RgbColor; design: RgbColor };
}

const PAD = { left: 62, right: 20, top: 64, bottom: 48 };
const valid = (points: SurveyPoint[]) => points.filter((p) => Number.isFinite(p.distance) && Number.isFinite(p.rl));

/** Presentation only. Profiles and interpolation come from the locked calculation engine. */
export function CrossSectionCanvas({
  pre, post, design, centerLine = null, centerLineLabel = "CL", vStep = 1, hStep = 5,
  height = 440, title = "Cross section", designWidth, designLevel, cutArea, fillArea, colors,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const behaviorRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const [transform, setTransform] = useState(zoomIdentity);
  const [size, setSize] = useState(0);
  const [hover, setHover] = useState<{ x: number; distance: number; rl: number } | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const available = [
    { key: "pre", name: "Pre-work ground", points: valid(pre), color: colors ? rgbToHex(colors.pre) : "var(--section-pre)", dash: [7, 4] },
    { key: "post", name: "Post-work ground", points: valid(post), color: colors ? rgbToHex(colors.post) : "var(--section-post)", dash: [] },
    { key: "design", name: "Design", points: valid(design), color: colors ? rgbToHex(colors.design) : "var(--section-design)", dash: [6, 4] },
  ].filter((series) => series.points.length > 0);
  const all = available.flatMap((series) => series.points);
  const hasData = all.length > 0;
  const xMin = hasData ? Math.min(...all.map((p) => p.distance)) : 0;
  const xMax = hasData ? Math.max(...all.map((p) => p.distance)) : 1;
  const yMin = hasData ? Math.min(...all.map((p) => p.rl)) : 0;
  const yMax = hasData ? Math.max(...all.map((p) => p.rl)) : 1;
  const x0 = Math.floor(xMin / hStep) * hStep;
  const x1 = Math.max(x0 + hStep, Math.ceil(xMax / hStep) * hStep);
  const y0 = Math.floor(yMin - 0.5);
  const y1 = Math.max(y0 + 1, Math.ceil(yMax + 0.5));
  const plotW = Math.max(1, size - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const sx = (d: number) => transform.applyX(PAD.left + ((d - x0) / (x1 - x0)) * plotW);
  const sy = (rl: number) => transform.applyY(PAD.top + plotH - ((rl - y0) / (y1 - y0)) * plotH);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => setSize(wrap.clientWidth));
    observer.observe(wrap);
    setSize(wrap.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size === 0) return;
    const behavior = zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([1, 20])
      .extent([[PAD.left, PAD.top], [size - PAD.right, height - PAD.bottom]])
      .filter((event: MouseEvent) => !event.button)
      .on("start", () => setHover(null))
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        setTransform(event.transform);
      });
    behaviorRef.current = behavior;
    select(canvas).call(behavior).call(behavior.transform, transformRef.current);
    return () => { select(canvas).on(".zoom", null); behaviorRef.current = null; };
  }, [size, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    const resolve = (color: string) => color.startsWith("var(") ? token(color.slice(4, -1)) : color;
    const fg = token("--foreground");
    const muted = token("--muted-foreground");
    ctx.fillStyle = token("--card");
    ctx.fillRect(0, 0, size, height);
    ctx.fillStyle = fg;
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.textAlign = "left";
    // Wrap the exported heading on small screens rather than colliding with the plot.
    ctx.fillText(title, PAD.left, 21, plotW);
    ctx.fillStyle = muted;
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillText(`Width ${designWidth?.toFixed(2) ?? "—"} m · Cut ${cutArea?.toFixed(2) ?? "—"} m² · Fill ${fillArea?.toFixed(2) ?? "—"} m²`, PAD.left, 40, plotW);
    if (!hasData) {
      ctx.textAlign = "center";
      ctx.fillText("No survey points at this chainage", size / 2, height / 2);
      return;
    }
    const left = x0 + ((transform.invertX(PAD.left) - PAD.left) / plotW) * (x1 - x0);
    const right = x0 + ((transform.invertX(size - PAD.right) - PAD.left) / plotW) * (x1 - x0);
    const bottom = y0 + ((PAD.top + plotH - transform.invertY(height - PAD.bottom)) / plotH) * (y1 - y0);
    const top = y0 + ((PAD.top + plotH - transform.invertY(PAD.top)) / plotH) * (y1 - y0);
    const niceStep = (range: number, count: number, minimum: number) => {
      const raw = Math.max(minimum, range / count);
      const power = 10 ** Math.floor(Math.log10(raw));
      return ([1, 2, 5, 10].find((n) => n * power >= raw) ?? 10) * power;
    };
    const dx = niceStep(right - left, Math.max(2, plotW / 75), hStep / 20);
    const dy = niceStep(top - bottom, 6, vStep / 20);
    ctx.font = "11px system-ui, sans-serif";
    ctx.strokeStyle = token("--border");
    ctx.fillStyle = muted;
    ctx.lineWidth = 1;
    ctx.textAlign = "center";
    for (let d = Math.ceil(left / dx) * dx; d <= right; d += dx) {
      ctx.beginPath(); ctx.moveTo(sx(d), PAD.top); ctx.lineTo(sx(d), height - PAD.bottom); ctx.stroke();
      ctx.fillText(d.toFixed(dx < 1 ? 2 : 0), sx(d), height - PAD.bottom + 18);
    }
    ctx.textAlign = "right";
    for (let rl = Math.ceil(bottom / dy) * dy; rl <= top; rl += dy) {
      ctx.beginPath(); ctx.moveTo(PAD.left, sy(rl)); ctx.lineTo(size - PAD.right, sy(rl)); ctx.stroke();
      ctx.fillText(rl.toFixed(dy < 1 ? 2 : 1), PAD.left - 8, sy(rl) + 4);
    }
    ctx.textAlign = "center";
    ctx.fillText("Offset (m)", PAD.left + plotW / 2, height - 7);
    ctx.save(); ctx.translate(14, PAD.top + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("RL (mSOB)", 0, 0); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(PAD.left, PAD.top, plotW, plotH); ctx.clip();
    for (const series of available.filter((s) => !hidden.includes(s.key))) {
      const pts = [...series.points].sort((a, b) => a.distance - b.distance);
      ctx.strokeStyle = resolve(series.color); ctx.fillStyle = resolve(series.color);
      ctx.setLineDash(series.dash); ctx.lineWidth = 2;
      ctx.beginPath();
      pts.forEach((p, i) => i ? ctx.lineTo(sx(p.distance), sy(p.rl)) : ctx.moveTo(sx(p.distance), sy(p.rl)));
      ctx.stroke(); ctx.setLineDash([]);
      for (const p of pts) { ctx.beginPath(); ctx.arc(sx(p.distance), sy(p.rl), 3, 0, 2 * Math.PI); ctx.fill(); }
    }
    if (centerLine !== null && Number.isFinite(centerLine)) {
      ctx.strokeStyle = token("--section-center"); ctx.fillStyle = token("--section-center");
      ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(sx(centerLine), PAD.top); ctx.lineTo(sx(centerLine), height - PAD.bottom); ctx.stroke(); ctx.setLineDash([]);
      ctx.textAlign = sx(centerLine) > size / 2 ? "right" : "left";
      ctx.fillText(`${centerLineLabel} ${centerLine.toFixed(2)} m`, sx(centerLine) + (ctx.textAlign === "right" ? -6 : 6), PAD.top + 14);
    }
    if (designWidth !== undefined && designLevel !== undefined && design.length >= 4 && !hidden.includes("design")) {
      const levelPoints = design.filter((p) => p.rl === designLevel);
      const a = levelPoints[0]; const b = levelPoints[levelPoints.length - 1];
      if (a && b) {
        const y = sy(designLevel) - 18;
        ctx.strokeStyle = resolve(available.find((s) => s.key === "design")?.color ?? "var(--section-design)");
        ctx.fillStyle = fg; ctx.textAlign = "center";
        ctx.beginPath(); ctx.moveTo(sx(a.distance), y); ctx.lineTo(sx(b.distance), y);
        for (const p of [a, b]) { ctx.moveTo(sx(p.distance), y - 4); ctx.lineTo(sx(p.distance), y + 4); }
        ctx.stroke(); ctx.fillText(`${designWidth.toFixed(2)} m`, (sx(a.distance) + sx(b.distance)) / 2, y - 5);
      }
    }
    if (hover) {
      ctx.strokeStyle = muted; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(hover.x, PAD.top); ctx.lineTo(hover.x, height - PAD.bottom); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.restore();
    ctx.strokeStyle = token("--border"); ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);
  });

  const zoomBy = (factor: number) => {
    const canvas = canvasRef.current; const behavior = behaviorRef.current;
    if (canvas && behavior) select(canvas).call(behavior.scaleBy, factor);
  };
  const reset = () => {
    const canvas = canvasRef.current; const behavior = behaviorRef.current;
    if (canvas && behavior) select(canvas).call(behavior.transform, zoomIdentity);
  };
  const exportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) { toast.error("Image export failed. Please try again."); return; }
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `${title.replace(/[^a-z0-9.-]+/gi, "-")}.png`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, "image/png");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" aria-label="Profile visibility">
          {available.map((series) => <Button key={series.key} variant={hidden.includes(series.key) ? "ghost" : "secondary"} size="sm" aria-pressed={!hidden.includes(series.key)} onClick={() => setHidden((prev) => prev.includes(series.key) ? prev.filter((k) => k !== series.key) : [...prev, series.key])}>
            <span className="h-0 w-4 border-t-2" style={{ borderColor: series.color, borderStyle: series.dash.length ? "dashed" : "solid" }} />{series.name}
          </Button>)}
        </div>
        <div className="flex items-center gap-1">
          <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(transform.k * 100)}%</span>
          <Button variant="outline" size="icon" title="Zoom out" aria-label="Zoom out" disabled={!hasData || transform.k <= 1} onClick={() => zoomBy(1 / 1.3)}><Minus /></Button>
          <Button variant="outline" size="icon" title="Zoom in" aria-label="Zoom in" disabled={!hasData || transform.k >= 20} onClick={() => zoomBy(1.3)}><Plus /></Button>
          <Button variant="outline" size="icon" title="Fit section" aria-label="Fit section" disabled={!hasData} onClick={reset}><Maximize /></Button>
          <Button variant="outline" size="icon" title="Export PNG image" aria-label="Export PNG image" disabled={!hasData} onClick={exportImage}><Download /></Button>
        </div>
      </div>
      <div ref={wrapRef} className="relative w-full overflow-hidden rounded-md border bg-card">
        <canvas ref={canvasRef} aria-label={`${title} interactive cross-section`} className="block w-full touch-none cursor-grab active:cursor-grabbing" style={{ height }} onMouseMove={(event) => {
          if (event.buttons || !hasData) { setHover(null); return; }
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left; const y = event.clientY - rect.top;
          if (x < PAD.left || x > size - PAD.right || y < PAD.top || y > height - PAD.bottom) { setHover(null); return; }
          setHover({ x, distance: x0 + ((transform.invertX(x) - PAD.left) / plotW) * (x1 - x0), rl: y0 + ((PAD.top + plotH - transform.invertY(y)) / plotH) * (y1 - y0) });
        }} onMouseLeave={() => setHover(null)} />
        {hover && <div className="pointer-events-none absolute top-16 z-10 w-44 rounded-md border bg-popover p-2 text-xs shadow-sm" style={{ left: Math.max(4, Math.min(hover.x + 12, size - 180)) }}>
          <div className="font-medium">Offset {hover.distance.toFixed(2)} m</div>
          <div className="text-muted-foreground">Cursor RL {hover.rl.toFixed(3)}</div>
          {available.filter((s) => !hidden.includes(s.key)).map((s) => <div key={s.key}>{s.name} RL {interpAt(s.points, hover.distance)?.toFixed(3) ?? "—"}</div>)}
        </div>}
      </div>
    </div>
  );
}
