import { useEffect, useRef, useState, useMemo } from "react";
import type { AnalysisData, AnalysisShot } from "../types";

type Props = {
  analysisData: AnalysisData | null;
  currentTime: number;
};

// Standard badminton court in normalised [0,1] — 6.1m wide × 13.4m long
const L = {
  net:    0.5,
  svcS:   (6.7 - 1.98) / 13.4,
  svcSb:  (6.7 + 1.98) / 13.4,
  svcLd:  0.76 / 13.4,
  svcLdb: 1 - 0.76 / 13.4,
  sideL:  0.46 / 6.1,
  sideR:  1 - 0.46 / 6.1,
  cx:     0.5,
};

const SHOT_COLORS: Record<string, string> = {
  Smash:   "#ef4444",
  Clear:   "#60a5fa",
  Drop:    "#f97316",
  Net:     "#22c55e",
  Lob:     "#a78bfa",
  Drive:   "#eab308",
  Unknown: "#6b7280",
};

function shotColor(type: string) {
  return SHOT_COLORS[type] ?? SHOT_COLORS.Unknown;
}

// Group shot events into rallies (gap > RALLY_GAP_SEC between shots = new rally)
const RALLY_GAP_SEC = 5;

function groupRallies(events: AnalysisShot[], fps: number): AnalysisShot[][] {
  if (!events.length) return [];
  const rallies: AnalysisShot[][] = [];
  let group: AnalysisShot[] = [events[0]];
  for (let i = 1; i < events.length; i++) {
    const gapSec = (events[i].frame - events[i - 1].frame) / fps;
    if (gapSec > RALLY_GAP_SEC) {
      rallies.push(group);
      group = [];
    }
    group.push(events[i]);
  }
  rallies.push(group);
  return rallies;
}

export default function LiveTracker({ analysisData, currentTime }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 240, h: 300 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        if (width > 0 && height > 0)
          setCanvasSize({ w: Math.round(width), h: Math.round(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fps = useMemo(() => {
    if (!analysisData) return 30;
    const dur = analysisData.summary.durationSec;
    const maxFrame = Math.max(
      ...(analysisData.shuttle_debug?.map((s) => s.frame) ?? [0]),
      ...(analysisData.tracking?.map((t) => t.frame) ?? [0]),
    );
    return dur > 0 && maxFrame > 0 ? maxFrame / dur : 30;
  }, [analysisData]);

  // Current rally + shots to display up to current time
  const displayShots = useMemo<AnalysisShot[]>(() => {
    const events = analysisData?.events ?? [];
    if (!events.length) return [];

    const currentFrame = Math.round(currentTime * fps);
    const rallies = groupRallies(events, fps);

    // Find the rally that contains currentFrame, or the nearest past rally
    let best: AnalysisShot[] = [];
    for (const rally of rallies) {
      const start = rally[0].frame;
      const end   = rally[rally.length - 1].frame;
      const gapFrames = RALLY_GAP_SEC * fps;

      if (currentFrame >= start - gapFrames && currentFrame <= end + gapFrames) {
        best = rally.filter((s) => s.frame <= currentFrame);
        break;
      }
      if (end < currentFrame) best = rally; // keep last past rally
    }
    return best;
  }, [analysisData, currentTime, fps]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width  = canvasSize.w;
    canvas.height = canvasSize.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { w: W, h: H } = canvasSize;
    ctx.clearRect(0, 0, W, H);
    if (!analysisData) return;

    // Court rectangle — fill available space with correct aspect ratio
    const PAD   = 16;
    const RATIO = 6.1 / 13.4;
    let cW = W - PAD * 2;
    let cH = cW / RATIO;
    if (cH > H - PAD * 2) { cH = H - PAD * 2; cW = cH * RATIO; }
    const cX = (W - cW) / 2;
    const cY = (H - cH) / 2;

    const uv  = (u: number, v: number): [number, number] => [cX + u * cW, cY + v * cH];
    const seg = (u1: number, v1: number, u2: number, v2: number, color: string, lw = 1) => {
      ctx.strokeStyle = color;
      ctx.lineWidth   = lw;
      ctx.beginPath();
      ctx.moveTo(...uv(u1, v1));
      ctx.lineTo(...uv(u2, v2));
      ctx.stroke();
    };

    // Court background
    ctx.fillStyle = "rgba(15,28,40,0.92)";
    ctx.beginPath();
    ctx.roundRect(cX - 4, cY - 4, cW + 8, cH + 8, 5);
    ctx.fill();

    const LINE  = "rgba(137,194,217,0.45)";
    const LINE2 = "rgba(137,194,217,0.7)";

    // Outer boundary
    seg(0, 0, 1, 0, LINE2, 1.5); seg(1, 0, 1, 1, LINE2, 1.5);
    seg(1, 1, 0, 1, LINE2, 1.5); seg(0, 1, 0, 0, LINE2, 1.5);
    // Net
    seg(0, L.net, 1, L.net, "rgba(137,194,217,0.85)", 2);
    // Short service lines
    seg(0, L.svcS, 1, L.svcS, LINE); seg(0, L.svcSb, 1, L.svcSb, LINE);
    // Long service lines
    seg(0, L.svcLd, 1, L.svcLd, LINE); seg(0, L.svcLdb, 1, L.svcLdb, LINE);
    // Singles sidelines
    seg(L.sideL, 0, L.sideL, 1, LINE); seg(L.sideR, 0, L.sideR, 1, LINE);
    // Centre service line
    seg(L.cx, L.svcS, L.cx, L.svcSb, LINE);

    if (!displayShots.length) {
      ctx.fillStyle = "rgba(137,194,217,0.2)";
      ctx.font = "11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("no rally data", W / 2, H / 2);
      return;
    }

    // Map location_m ([x_metres, y_metres]) to court unit space
    // Homography origin: (0,0) = TL corner, x right, y down
    const COURT_W_M = 6.1, COURT_H_M = 13.4;
    const toUnit = (loc: [number, number]): [number, number] | null => {
      if (!loc) return null;
      const u = Math.max(0, Math.min(1, loc[0] / COURT_W_M));
      const v = Math.max(0, Math.min(1, loc[1] / COURT_H_M));
      return [u, v];
    };

    // Collect valid positioned shots
    const positioned = displayShots
      .map((s) => ({ shot: s, uv: s.location_m ? toUnit(s.location_m as [number, number]) : null }))
      .filter((x) => x.uv !== null) as { shot: AnalysisShot; uv: [number, number] }[];

    if (!positioned.length) {
      ctx.fillStyle = "rgba(137,194,217,0.2)";
      ctx.font = "11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("awaiting position data", W / 2, H / 2);
      return;
    }

    // Draw connecting lines between shots
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1;
    for (let i = 1; i < positioned.length; i++) {
      const prev = positioned[i - 1].uv;
      const curr = positioned[i].uv;
      const alpha = 0.2 + 0.5 * (i / positioned.length);
      ctx.strokeStyle = `rgba(137,194,217,${alpha})`;
      ctx.beginPath();
      ctx.moveTo(...uv(prev[0], prev[1]));
      ctx.lineTo(...uv(curr[0], curr[1]));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Draw arrowhead on each connection
    for (let i = 1; i < positioned.length; i++) {
      const [x1, y1] = uv(positioned[i-1].uv[0], positioned[i-1].uv[1]);
      const [x2, y2] = uv(positioned[i].uv[0],   positioned[i].uv[1]);
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const aLen = 5;
      const alpha = 0.3 + 0.5 * (i / positioned.length);
      ctx.strokeStyle = `rgba(137,194,217,${alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mx - aLen * Math.cos(angle - 0.4), my - aLen * Math.sin(angle - 0.4));
      ctx.lineTo(mx, my);
      ctx.lineTo(mx - aLen * Math.cos(angle + 0.4), my - aLen * Math.sin(angle + 0.4));
      ctx.stroke();
    }

    // Draw shot dots
    positioned.forEach(({ shot, uv: [u, v] }, i) => {
      const [cx, cy] = [cX + u * cW, cY + v * cH];
      const color  = shotColor(shot.type);
      const isLast = i === positioned.length - 1;
      const r      = isLast ? 6 : 4.5;

      // Glow for latest shot
      if (isLast) {
        ctx.shadowBlur  = 12;
        ctx.shadowColor = color;
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // White ring on latest dot
      if (isLast) {
        ctx.strokeStyle = "white";
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Shot type label above dot (skip if crowded)
      if (isLast || positioned.length <= 6) {
        ctx.fillStyle = color;
        ctx.font      = `bold ${Math.max(7, Math.round(cW * 0.048))}px monospace`;
        ctx.textAlign = "center";
        ctx.fillText(shot.type, cx, cy - r - 3);
      }
    });

  }, [analysisData, displayShots, canvasSize]);

  const hasData   = !!analysisData;
  const rallyLen  = displayShots.length;

  return (
    <div className="bg-surface border border-border rounded-2xl flex flex-col overflow-hidden h-full">
      <div className="py-2.5 px-4 border-b border-border flex items-center justify-between shrink-0">
        <span className="text-[10px] font-bold tracking-[1.2px] uppercase text-slate-500 dark:text-slate-400">
          Rally Map
        </span>
        {hasData && (
          <div className="flex items-center gap-3">
            {rallyLen > 0 && (
              <span className="text-[9px] text-primary font-semibold tabular-nums">
                {rallyLen} shot{rallyLen !== 1 ? "s" : ""}
              </span>
            )}
            {Object.entries(SHOT_COLORS).slice(0, 4).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                <span className="text-[8px] text-slate-400 dark:text-slate-500">{type}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div ref={containerRef} className="flex-1 relative min-h-0">
        {hasData ? (
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium text-center">
              Rally map available
              <br />
              after analysis completes
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
