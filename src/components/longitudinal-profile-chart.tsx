import { useEffect, useRef, useState } from "react";
import { select } from "d3-selection";
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { Maximize, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { LongitudinalPoint } from "@/lib/earthwork/longitudinal";
import type { ChainageUnit } from "@/lib/earthwork/types";

const PAD = { left: 64, right: 24, top: 24, bottom: 52 };
const HEIGHT = 460;

export function LongitudinalProfileChart({ points, unit }: { points: LongitudinalPoint[]; unit: ChainageUnit }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const behaviorRef = useRef<ZoomBehavior<HTMLCanvasElement, unknown> | null>(null);
  const transformRef = useRef<ZoomTransform>(zoomIdentity);
  const [transform, setTransform] = useState(zoomIdentity);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<LongitudinalPoint | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const levels = points.flatMap((p) => [p.groundRL, p.formationRL]).filter((v): v is number => v !== null);
  const hasData = points.length > 0 && levels.length > 0;
  const first = points[0]?.chainage ?? 0;
  const last = points[points.length - 1]?.chainage ?? 1;
  const x0 = first === last ? first - (unit === "KM" ? 0.01 : 10) : first;
  const x1 = first === last ? last + (unit === "KM" ? 0.01 : 10) : last;
  const y0 = hasData ? Math.floor(Math.min(...levels) - 0.5) : 0;
  const y1 = hasData ? Math.ceil(Math.max(...levels) + 0.5) : 1;
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const sx = (ch: number) => transform.applyX(PAD.left + (ch - x0) / (x1 - x0) * plotW);
  const sy = (rl: number) => PAD.top + plotH - (rl - y0) / (y1 - y0) * plotH;
  const series = [
    { key: "groundRL" as const, label: "Existing ground RL (CL)", token: "--section-pre", dash: [6, 4] },
    { key: "formationRL" as const, label: "Formation RL", token: "--chart-2", dash: [] },
  ];

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => setWidth(wrap.clientWidth));
    observer.observe(wrap);
    setWidth(wrap.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !width) return;
    const extent: [[number, number], [number, number]] = [[PAD.left, PAD.top], [width - PAD.right, HEIGHT - PAD.bottom]];
    const behavior = zoom<HTMLCanvasElement, unknown>().scaleExtent([1, 40])
      .extent(extent).translateExtent(extent)
      .filter((event: MouseEvent) => !event.button)
      .on("start", () => setHover(null))
      .on("zoom", (event) => {
        transformRef.current = event.transform;
        setTransform(event.transform);
      });
    behaviorRef.current = behavior;
    select(canvas).call(behavior).call(behavior.transform, transformRef.current);
    return () => { select(canvas).on(".zoom", null); behaviorRef.current = null; };
  }, [width]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const token = (name: string) => css.getPropertyValue(name).trim();
    ctx.fillStyle = token("--card"); ctx.fillRect(0, 0, width, HEIGHT);
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = token("--muted-foreground");
    if (!hasData) { ctx.textAlign = "center"; ctx.fillText("No survey levels available", width / 2, HEIGHT / 2); return; }
    const left = x0 + (transform.invertX(PAD.left) - PAD.left) / plotW * (x1 - x0);
    const right = x0 + (transform.invertX(width - PAD.right) - PAD.left) / plotW * (x1 - x0);
    const raw = (right - left) / Math.max(2, Math.floor(plotW / 100));
    const power = 10 ** Math.floor(Math.log10(raw));
    const step = ([1, 2, 5, 10].find((n) => n * power >= raw) ?? 10) * power;
    ctx.strokeStyle = token("--border"); ctx.lineWidth = 1; ctx.textAlign = "center";
    for (let ch = Math.ceil(left / step) * step; ch <= right; ch += step) {
      ctx.beginPath(); ctx.moveTo(sx(ch), PAD.top); ctx.lineTo(sx(ch), HEIGHT - PAD.bottom); ctx.stroke();
      ctx.fillText(ch.toFixed(Math.max(0, Math.min(6, -Math.floor(Math.log10(step))))), sx(ch), HEIGHT - PAD.bottom + 20);
    }
    ctx.textAlign = "right";
    for (let i = 0; i <= 6; i++) {
      const rl = y0 + (y1 - y0) * i / 6;
      ctx.beginPath(); ctx.moveTo(PAD.left, sy(rl)); ctx.lineTo(width - PAD.right, sy(rl)); ctx.stroke();
      ctx.fillText(rl.toFixed(2), PAD.left - 8, sy(rl) + 4);
    }
    ctx.textAlign = "center"; ctx.fillText(`Chainage (${unit})`, PAD.left + plotW / 2, HEIGHT - 8);
    ctx.save(); ctx.translate(15, PAD.top + plotH / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("RL (mSOB)", 0, 0); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(PAD.left, PAD.top, plotW, plotH); ctx.clip();
    for (const s of series.filter((s) => !hidden.includes(s.key))) {
      ctx.strokeStyle = token(s.token); ctx.fillStyle = token(s.token); ctx.lineWidth = 2; ctx.setLineDash(s.dash);
      ctx.beginPath(); let started = false;
      for (const p of points) {
        const rl = p[s.key];
        if (rl === null) { started = false; continue; }
        if (started) ctx.lineTo(sx(p.chainage), sy(rl)); else ctx.moveTo(sx(p.chainage), sy(rl));
        started = true;
      }
      ctx.stroke(); ctx.setLineDash([]);
      for (const p of points) { const rl = p[s.key]; if (rl === null) continue; ctx.beginPath(); ctx.arc(sx(p.chainage), sy(rl), 3, 0, 2 * Math.PI); ctx.fill(); }
    }
    if (hover) { ctx.strokeStyle = token("--muted-foreground"); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(sx(hover.chainage), PAD.top); ctx.lineTo(sx(hover.chainage), HEIGHT - PAD.bottom); ctx.stroke(); }
    ctx.restore(); ctx.strokeStyle = token("--border"); ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);
  });

  const zoomBy = (factor: number) => { const canvas = canvasRef.current; const behavior = behaviorRef.current; if (canvas && behavior) select(canvas).call(behavior.scaleBy, factor); };
  return <section className="space-y-3" aria-label="Longitudinal profile chart">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1">
        {series.map((s) => <Button key={s.key} size="sm" variant={hidden.includes(s.key) ? "ghost" : "secondary"} aria-pressed={!hidden.includes(s.key)} onClick={() => setHidden((prev) => prev.includes(s.key) ? prev.filter((key) => key !== s.key) : [...prev, s.key])}>
          <span className={`w-4 border-t-2 ${s.key === "groundRL" ? "border-section-pre border-dashed" : "border-chart-2"}`} />{s.label}
        </Button>)}
      </div>
      <div className="flex items-center gap-1">
        <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(transform.k * 100)}%</span>
        <Button variant="outline" size="icon" aria-label="Zoom out" title="Zoom out" disabled={!hasData || transform.k <= 1} onClick={() => zoomBy(1 / 1.3)}><Minus /></Button>
        <Button variant="outline" size="icon" aria-label="Zoom in" title="Zoom in" disabled={!hasData || transform.k >= 40} onClick={() => zoomBy(1.3)}><Plus /></Button>
        <Button variant="outline" size="icon" aria-label="Fit profile" title="Fit profile" disabled={!hasData} onClick={() => { const canvas = canvasRef.current; const behavior = behaviorRef.current; if (canvas && behavior) select(canvas).call(behavior.transform, zoomIdentity); }}><Maximize /></Button>
      </div>
    </div>
    <div ref={wrapRef} className="relative overflow-hidden rounded-md border bg-card">
      <canvas ref={canvasRef} className="block w-full touch-none cursor-grab active:cursor-grabbing" style={{ height: HEIGHT }} aria-label="Existing ground and formation RL against chainage" onMouseLeave={() => setHover(null)} onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top;
        if (event.buttons || x < PAD.left || x > width - PAD.right || y < PAD.top || y > HEIGHT - PAD.bottom) { setHover(null); return; }
        const visible = points.filter((p) => sx(p.chainage) >= PAD.left && sx(p.chainage) <= width - PAD.right);
        setHover(visible.reduce<LongitudinalPoint | null>((nearest, p) => !nearest || Math.abs(sx(p.chainage) - x) < Math.abs(sx(nearest.chainage) - x) ? p : nearest, null));
      }} />
      {hover && <div role="tooltip" className="pointer-events-none absolute top-6 w-52 max-w-full rounded-md border bg-popover p-3 text-xs shadow-sm" style={{ left: Math.max(4, Math.min(sx(hover.chainage) + 12, width - 212)) }}>
        <p className="mb-2 font-semibold">CH {hover.chainage} {unit}</p>
        <p>Existing ground RL: {hover.groundRL?.toFixed(3) ?? "—"} mSOB</p>
        <p>Formation RL: {hover.formationRL?.toFixed(3) ?? "—"} mSOB</p>
        <p className="mt-1 text-muted-foreground">CL offset: {hover.centerLine?.toFixed(2) ?? "—"} m</p>
      </div>}
    </div>
  </section>;
}