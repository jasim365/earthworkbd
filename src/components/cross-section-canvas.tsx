import { useEffect, useRef, useState } from "react";

import type { SurveyPoint } from "@/lib/earthwork/types";

interface Props {
  pre: SurveyPoint[];
  post: SurveyPoint[];
  design: SurveyPoint[];
  /** resolved centre-line offset (m) to mark on the plot */
  centerLine?: number | null;
  /** label drawn next to the centre line */
  centerLineLabel?: string;
  /** vertical grid spacing in metres (0–5 m band lines) */
  vStep?: number;
  /** horizontal (offset) grid spacing in metres */
  hStep?: number;
  height?: number;
}

const PAD = { left: 52, right: 16, top: 16, bottom: 34 };

/**
 * Interactive canvas cross-section: red dashed pre-work RL, green solid
 * post-work RL, dashed design template, on a 0–5 m gridded frame.
 */
export function CrossSectionCanvas({
  pre,
  post,
  design,
  centerLine = null,
  centerLineLabel = "CL",
  vStep = 1,
  hStep = 5,
  height = 380,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<{ x: number; d: number; pre: number | null; post: number | null } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const draw = () => {
      const width = wrap.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const all = [...pre, ...post, ...design];
      if (all.length < 2) return;
      const xs = all.map((p) => p.distance);
      const ys = all.map((p) => p.rl);
      const x0 = Math.floor(Math.min(...xs) / hStep) * hStep;
      const x1 = Math.ceil(Math.max(...xs) / hStep) * hStep;
      const y0 = Math.floor(Math.min(...ys) - 0.5);
      const y1 = Math.ceil(Math.max(...ys) + 0.5);
      const plotW = width - PAD.left - PAD.right;
      const plotH = height - PAD.top - PAD.bottom;
      const sx = (d: number) => PAD.left + ((d - x0) / (x1 - x0 || 1)) * plotW;
      const sy = (rl: number) => PAD.top + plotH - ((rl - y0) / (y1 - y0 || 1)) * plotH;

      const css = getComputedStyle(document.documentElement);
      const border = css.getPropertyValue("--border").trim() || "#d4d4d8";
      const fg = css.getPropertyValue("--muted-foreground").trim() || "#71717a";

      // grid
      ctx.lineWidth = 1;
      ctx.font = "11px system-ui, sans-serif";
      ctx.strokeStyle = border;
      ctx.fillStyle = fg;
      ctx.textAlign = "center";
      for (let d = x0; d <= x1 + 1e-6; d += hStep) {
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(sx(d), PAD.top);
        ctx.lineTo(sx(d), PAD.top + plotH);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(d.toFixed(0), sx(d), height - PAD.bottom + 16);
      }
      ctx.textAlign = "right";
      for (let rl = y0; rl <= y1 + 1e-6; rl += vStep) {
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(PAD.left, sy(rl));
        ctx.lineTo(PAD.left + plotW, sy(rl));
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillText(rl.toFixed(1), PAD.left - 8, sy(rl) + 3);
      }
      ctx.textAlign = "center";
      ctx.fillText("Distance (m)", PAD.left + plotW / 2, height - 4);

      const line = (pts: SurveyPoint[], color: string, dash: number[]) => {
        const p = [...pts].sort((a, b) => a.distance - b.distance);
        if (p.length < 2) return;
        ctx.save();
        ctx.setLineDash(dash);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        p.forEach((q, i) => (i ? ctx.lineTo(sx(q.distance), sy(q.rl)) : ctx.moveTo(sx(q.distance), sy(q.rl))));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color;
        p.forEach((q) => {
          ctx.beginPath();
          ctx.arc(sx(q.distance), sy(q.rl), 2.5, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      };

      line(design, "#9ca3af", [6, 4]);
      line(pre, "#dc2626", [7, 4]);
      line(post, "#16a34a", []);

      if (typeof centerLine === "number" && Number.isFinite(centerLine)) {
        const cx = sx(centerLine);
        ctx.save();
        ctx.strokeStyle = "#7c3aed";
        ctx.lineWidth = 1.75;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(cx, PAD.top);
        ctx.lineTo(cx, PAD.top + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#7c3aed";
        ctx.font = "600 11px system-ui, sans-serif";
        ctx.textAlign = cx > PAD.left + plotW - 60 ? "right" : "left";
        ctx.fillText(`${centerLineLabel} ${centerLine.toFixed(2)} m`, cx + (ctx.textAlign === "right" ? -5 : 5), PAD.top + 12);
        ctx.restore();
      }


      if (hover) {
        ctx.save();
        ctx.strokeStyle = fg;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(sx(hover.d), PAD.top);
        ctx.lineTo(sx(hover.d), PAD.top + plotH);
        ctx.stroke();
        ctx.restore();
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [pre, post, design, centerLine, centerLineLabel, vStep, hStep, height, hover]);

  const interp = (pts: SurveyPoint[], d: number): number | null => {
    const p = [...pts].sort((a, b) => a.distance - b.distance);
    if (p.length < 2 || d < p[0]!.distance || d > p[p.length - 1]!.distance) return null;
    for (let i = 1; i < p.length; i++) {
      if (d <= p[i]!.distance) {
        const a = p[i - 1]!;
        const b = p[i]!;
        const t = (d - a.distance) / (b.distance - a.distance || 1);
        return a.rl + t * (b.rl - a.rl);
      }
    }
    return null;
  };

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const all = [...pre, ...post, ...design];
    if (all.length < 2) return;
    const xs = all.map((p) => p.distance);
    const x0 = Math.floor(Math.min(...xs) / hStep) * hStep;
    const x1 = Math.ceil(Math.max(...xs) / hStep) * hStep;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const plotW = rect.width - PAD.left - PAD.right;
    const d = x0 + ((px - PAD.left) / (plotW || 1)) * (x1 - x0);
    if (d < x0 || d > x1) return setHover(null);
    setHover({ x: px, d, pre: interp(pre, d), post: interp(post, d) });
  };

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="w-full cursor-crosshair rounded-md border bg-card"
      />
      {hover && (
        <div
          className="pointer-events-none absolute top-3 rounded-md border bg-popover px-2 py-1 text-xs shadow-sm"
          style={{ left: Math.min(Math.max(hover.x + 10, 8), (wrapRef.current?.clientWidth ?? 0) - 150) }}
        >
          <div className="font-medium">Dist {hover.d.toFixed(2)} m</div>
          <div className="text-destructive">Pre RL {hover.pre?.toFixed(3) ?? "—"}</div>
          <div className="text-[hsl(142_71%_35%)]">Post RL {hover.post?.toFixed(3) ?? "—"}</div>
        </div>
      )}
    </div>
  );
}
