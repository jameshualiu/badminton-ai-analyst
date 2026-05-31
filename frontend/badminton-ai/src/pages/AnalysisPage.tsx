import { Timestamp, doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../lib/firebase";
import { useAuthUser } from "../auth/hooks/useAuthUser";
import { shotColor } from "../utils/shotUtils";
import LiveTracker from "../features/analysis/components/LiveTracker";
import type {
  AnalysisData,
  AnalysisShot,
  TrackingFrame,
  VideoStatus,
} from "../features/analysis/types";

const COCO_PAIRS: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 4], [5, 6], [5, 7], [7, 9],
  [6, 8], [8, 10], [5, 11], [6, 12], [11, 12], [11, 13],
  [13, 15], [12, 14], [14, 16],
];

type FirestoreVideoDoc = {
  title?: string;
  status?: VideoStatus;
  error?: string | null;
  duration?: number | null;
  totalShots?: number | null;
  analysisJson?: string | null;
  updatedAt?: Timestamp;
  createdAt?: Timestamp;
};

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api/v1";

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60),
    s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtDate(ts: Timestamp | undefined): string {
  if (!ts?.toDate) return "";
  return ts
    .toDate()
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
}

export default function AnalysisPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const { user } = useAuthUser();

  const [docData, setDocData] = useState<FirestoreVideoDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [urls, setUrls] = useState<Partial<Record<string, string>>>({});
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [ov, setOv] = useState({ court: true, pose: true, shuttle: true });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const renderOverlayRef = useRef<() => void>(() => {});
  const tlRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<number | null>(null);

  // Firestore subscription
  useEffect(() => {
    if (!user || !videoId) return;
    const ref = doc(db, "users", user.uid, "videos", videoId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) setDocData(snap.data() as FirestoreVideoDoc);
        else setDocData(null);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [user, videoId]);

  const status = docData?.status ?? "queued";

  // Fetch results
  useEffect(() => {
    if (!user || !videoId || !docData) return;
    if (status !== "done" && status !== "running") return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`${API_BASE}/videos/${videoId}/results`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to fetch results");
        const data = await res.json();
        if (cancelled) return;
        if (data.urls) {
          setUrls(data.urls);
          if (data.urls.analysisJson) {
            try {
              const jr = await fetch(data.urls.analysisJson);
              if (!jr.ok) throw new Error("Failed to fetch JSON");
              const json = await jr.json();
              if (!cancelled) setAnalysisData(json);
            } catch (e) {
              console.error(e);
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, videoId, status]);

  const duration = docData?.duration ?? 0;
  const pct = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  const trackingByFrame = useMemo(() => {
    const m = new Map<number, TrackingFrame>();
    analysisData?.tracking?.forEach((e) => m.set(e.frame, e));
    return m;
  }, [analysisData]);

  const shuttleByFrame = useMemo(() => {
    const m = new Map<
      number,
      { frame: number; pos: [number, number] | null; confidence: number }
    >();
    analysisData?.shuttle_debug?.forEach((e) => m.set(e.frame, e));
    return m;
  }, [analysisData]);

  // Keep renderOverlayRef fresh so the RAF loop never captures stale deps
  useEffect(() => {
    renderOverlayRef.current = () => {
      const canvas = overlayRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width,
        h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (!analysisData) return;

      const res = analysisData.summary.resolution;
      const sx = w / res[0],
        sy = h / res[1];
      const sc = (pt: [number, number]): [number, number] => [
        pt[0] * sx,
        pt[1] * sy,
      ];
      const dur = analysisData.summary.durationSec;
      const maxFrame = Math.max(
        ...(analysisData.shuttle_debug?.map((s) => s.frame) ?? [0]),
        ...(analysisData.tracking?.map((t) => t.frame) ?? [0]),
      );
      const fps = dur > 0 && maxFrame > 0 ? maxFrame / dur : 30;
      const frame = Math.round((videoRef.current?.currentTime ?? 0) * fps);

      if (ov.court && analysisData.geometry?.court_keypoints_35) {
        const kp = analysisData.geometry.court_keypoints_35;
        ctx.strokeStyle = "rgba(137,194,217,0.55)";
        ctx.lineWidth = 1.5;
        for (let row = 0; row < 7; row++) {
          for (let col = 0; col < 5; col++) {
            const idx = row * 5 + col;
            if (!kp[idx]) continue;
            const [x, y] = sc(kp[idx]);
            if (col < 4 && kp[idx + 1]) {
              const [nx, ny] = sc(kp[idx + 1]);
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(nx, ny);
              ctx.stroke();
            }
            if (row < 6 && kp[idx + 5]) {
              const [nx, ny] = sc(kp[idx + 5]);
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(nx, ny);
              ctx.stroke();
            }
          }
        }
      }

      if (ov.pose && analysisData.tracking?.length) {
        let entry = trackingByFrame.get(frame);
        for (let off = 1; off <= 3 && !entry; off++) {
          entry = trackingByFrame.get(frame - off) ?? trackingByFrame.get(frame + off);
        }
        if (entry) {
          const playerColors = ["#89c2d9", "#2c7da0"];
          entry.players.forEach((player, pi) => {
            const color = playerColors[pi % 2];
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            COCO_PAIRS.forEach(([a, b]) => {
              const pa = player.skeleton[a],
                pb = player.skeleton[b];
              if (!pa || !pb) return;
              if (pa[0] === 0 && pa[1] === 0) return;
              if (pb[0] === 0 && pb[1] === 0) return;
              const [ax, ay] = sc(pa);
              const [bx, by] = sc(pb);
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.lineTo(bx, by);
              ctx.stroke();
            });
            ctx.fillStyle = color;
            player.skeleton.forEach((pt) => {
              if (!pt || (pt[0] === 0 && pt[1] === 0)) return;
              const [x, y] = sc(pt);
              ctx.beginPath();
              ctx.arc(x, y, 1.5, 0, Math.PI * 2);
              ctx.fill();
            });
          });
        }
      }

      if (ov.shuttle && analysisData.shuttle_debug?.length) {
        let entry = shuttleByFrame.get(frame);
        for (let off = 1; off <= 3 && !entry?.pos; off++) {
          entry = shuttleByFrame.get(frame - off) ?? shuttleByFrame.get(frame + off);
        }
        if (entry?.pos) {
          const [x, y] = sc(entry.pos);
          ctx.shadowBlur = 5;
          ctx.shadowColor = "#89c2d9";
          ctx.fillStyle = "#fff";
          ctx.beginPath();
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    };
  }, [analysisData, ov, trackingByFrame, shuttleByFrame]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const update = () => {
      setCurrentTime(v.currentTime);
      renderOverlayRef.current();
      animRef.current = requestAnimationFrame(update);
    };
    animRef.current = requestAnimationFrame(update);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [urls]);

  useEffect(() => {
    const handleResize = () => {
      const c = overlayRef.current;
      if (c && c.clientWidth > 0) {
        c.width = c.clientWidth;
        c.height = c.clientHeight;
        renderOverlayRef.current();
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleTlMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tlRef.current || !videoRef.current || duration <= 0) return;
    const seek = (clientX: number) => {
      const rect = tlRef.current!.getBoundingClientRect();
      const p = Math.max(0, Math.min((clientX - rect.left) / rect.width, 1));
      const t = p * duration;
      videoRef.current!.currentTime = t;
      setCurrentTime(t);
    };
    seek(e.clientX);
    const onMove = (ev: MouseEvent) => seek(ev.clientX);
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const toggleOv = (k: keyof typeof ov) =>
    setOv((prev) => ({ ...prev, [k]: !prev[k] }));

  const shotEvents: AnalysisShot[] = analysisData?.events ?? [];

  const shuttleVisibility = useMemo(() => {
    if (!analysisData?.shuttle_debug?.length) return null;
    const detected = analysisData.shuttle_debug.filter(s => s.pos !== null).length;
    const total = analysisData.shuttle_debug.length;
    return { detected, total, pct: Math.round((detected / total) * 100) };
  }, [analysisData]);

  const metaLine = [
    fmtDate(docData?.createdAt),
    duration ? fmtTime(duration) : null,
    docData?.totalShots != null ? `${docData.totalShots} shots detected` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="flex-1 p-8 flex flex-col gap-6 min-w-0 overflow-y-auto w-full">
      {loading ? (
        <div className="flex items-center justify-center p-8 text-[14px] text-slate-500 dark:text-slate-400">
          Loading your analysis…
        </div>
      ) : !docData ? (
        <div className="flex items-center justify-center p-8 text-[14px] text-slate-500 dark:text-slate-400">
          Analysis not found
        </div>
      ) : (
        <>
          {/* Page header */}
          <div className="flex items-center justify-between shrink-0">
            <div>
              <div className="text-[24px] font-semibold tracking-[-0.6px]">
                {docData.title ?? "Match Analysis"}
              </div>
              {metaLine && (
                <div className="text-[14px] text-slate-500 dark:text-slate-400 mt-0.5 font-light">
                  {metaLine}
                </div>
              )}
            </div>
          </div>

          {/* Top: video (wider) + LiveTracker */}
          <div
            className="grid gap-4 items-stretch shrink-0"
            style={{ gridTemplateColumns: "minmax(0, 3fr) minmax(200px, 280px)" }}
          >
            {/* Video player */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-2xl overflow-hidden flex flex-col">
              <div className="relative w-full aspect-video bg-[#04080d] flex items-center justify-center cursor-pointer group">
                {urls.annotatedVideo || urls.originalVideo ? (
                  <video
                    ref={videoRef}
                    src={urls.annotatedVideo || urls.originalVideo}
                    className="w-full h-full object-contain block"
                    onClick={(e) => {
                      const v = e.currentTarget;
                      if (v.paused) v.play();
                      else v.pause();
                    }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary/10 border-[1.5px] border-primary/30 flex items-center justify-center opacity-65 transition-opacity group-hover:opacity-100">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M5 3l9 5-9 5V3z" fill="currentColor" className="text-primary" />
                    </svg>
                  </div>
                )}
                <span className="absolute top-3 left-4 text-[11px] text-slate-400 dark:text-slate-500 font-light pointer-events-none">
                  {docData.title ?? videoId}
                </span>
                {duration > 0 && (
                  <span className="absolute top-3 right-4 text-[11px] text-slate-400 dark:text-slate-500 pointer-events-none">
                    {fmtTime(duration)}
                  </span>
                )}
                <canvas
                  className="absolute inset-0 w-full h-full pointer-events-none"
                  ref={overlayRef}
                />
                {analysisData && (
                  <div className="absolute bottom-3 left-4 flex gap-2">
                    {(["court", "pose", "shuttle"] as const).map((k) => (
                      <button
                        key={k}
                        onClick={() => toggleOv(k)}
                        className={`text-[10px] font-medium py-1 px-2.5 rounded-lg border cursor-pointer transition-all ${
                          ov[k]
                            ? "bg-primary/15 border-primary/40 text-primary"
                            : "border-primary/20 bg-[#080c10]/80 text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {k.charAt(0).toUpperCase() + k.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div className="p-4 px-5 pb-5 border-t border-slate-200 dark:border-border">
                <div
                  className="relative h-8 flex items-center cursor-pointer select-none"
                  ref={tlRef}
                  onMouseDown={handleTlMouseDown}
                >
                  <div className="w-full h-[3px] bg-primary/10 rounded-full">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                  {shotEvents.map((ev, i) => {
                    const evPct = duration > 0 ? (ev.frame / 30 / duration) * 100 : 0;
                    const c = shotColor(ev.type);
                    return (
                      <div
                        key={i}
                        className="absolute -translate-x-1/2 w-[6px] h-[6px] rounded-full border border-[#080c10] transition-transform hover:scale-[1.8]"
                        style={{ left: `${evPct}%`, background: c, boxShadow: `0 0 8px ${c}80` }}
                      />
                    );
                  })}
                  <div
                    className="absolute w-[13px] h-[13px] rounded-full bg-white border-2 border-primary -translate-x-1/2 pointer-events-none shadow-md"
                    style={{ left: `${pct * 100}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[12px] text-primary font-semibold tabular-nums">
                    {fmtTime(currentTime)}
                  </span>
                  <span className="text-[12px] text-slate-500 dark:text-slate-400 font-light tabular-nums">
                    {fmtTime(duration)}
                  </span>
                </div>
              </div>
            </div>

            <LiveTracker analysisData={analysisData} currentTime={currentTime} />
          </div>

          {/* Always-visible stats row */}
          <div className="grid grid-cols-3 gap-4 shrink-0">
            {/* Shot breakdown with bar chart */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-2xl p-5">
              <div className="text-[10px] font-bold tracking-[1px] uppercase text-slate-500 dark:text-slate-400 mb-1">
                Shot breakdown
              </div>
              <div className="text-[28px] font-bold tracking-[-1px] leading-none text-primary mb-4">
                {docData.totalShots ?? "—"}
              </div>
              {analysisData?.summary.shotCounts &&
                Object.keys(analysisData.summary.shotCounts).length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {Object.entries(analysisData.summary.shotCounts)
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .map(([type, count]) => {
                      const pct = docData.totalShots
                        ? ((count as number) / docData.totalShots) * 100
                        : 0;
                      return (
                        <div key={type}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: shotColor(type) }} />
                              {type}
                            </span>
                            <span className="text-[11px] font-bold tabular-nums">{count as number}</span>
                          </div>
                          <div className="h-1 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, background: shotColor(type) }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="text-[12px] text-slate-400 dark:text-slate-500">
                  {status === "done" ? "No shot data" : "Processing…"}
                </div>
              )}
            </div>

            {/* Match metrics */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-2xl p-5">
              <div className="text-[10px] font-bold tracking-[1px] uppercase text-slate-500 dark:text-slate-400 mb-4">
                Match
              </div>
              <div className="space-y-4">
                <div>
                  <div className="text-[12px] text-slate-500 dark:text-slate-400 mb-1">Duration</div>
                  <div className="text-[22px] font-bold tracking-[-0.5px]">
                    {duration ? fmtTime(duration) : "—"}
                  </div>
                </div>
                <div className="h-px bg-slate-100 dark:bg-border" />
                <div>
                  <div className="text-[12px] text-slate-500 dark:text-slate-400 mb-1">Total shots</div>
                  <div className="text-[22px] font-bold tracking-[-0.5px] text-primary">
                    {docData.totalShots ?? "—"}
                  </div>
                </div>
                <div className="h-px bg-slate-100 dark:bg-border" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[12px] text-slate-500 dark:text-slate-400 mb-1">Court</div>
                    <div className={`text-[13px] font-bold ${analysisData?.geometry?.court_keypoints_6 ? "text-primary" : "text-slate-400 dark:text-slate-500"}`}>
                      {analysisData?.geometry?.court_keypoints_6 ? "✓ Detected" : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[12px] text-slate-500 dark:text-slate-400 mb-1">Resolution</div>
                    <div className="text-[13px] font-bold">
                      {analysisData?.summary.resolution?.join("×") ?? "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tracking stats */}
            <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-2xl p-5">
              <div className="text-[10px] font-bold tracking-[1px] uppercase text-slate-500 dark:text-slate-400 mb-4">
                Tracking
              </div>
              <div className="space-y-4">
                <div>
                  <div className="text-[12px] text-slate-500 dark:text-slate-400 mb-1">Shuttle visibility</div>
                  <div className="text-[22px] font-bold tracking-[-0.5px] text-primary">
                    {shuttleVisibility ? `${shuttleVisibility.pct}%` : "—"}
                  </div>
                  {shuttleVisibility && (
                    <div className="mt-2 h-1.5 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${shuttleVisibility.pct}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="h-px bg-slate-100 dark:bg-border" />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[12px] text-slate-500 dark:text-slate-400 mb-1">Detected</div>
                    <div className="text-[18px] font-bold text-primary">
                      {shuttleVisibility?.detected ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[12px] text-slate-500 dark:text-slate-400 mb-1">Frames</div>
                    <div className="text-[18px] font-bold">
                      {shuttleVisibility?.total ?? "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Shot log — always visible, full width */}
          <div className="bg-white dark:bg-card border border-slate-200 dark:border-border rounded-2xl overflow-hidden flex flex-col">
            <div className="py-2.5 px-5 border-b border-slate-200 dark:border-border flex items-center justify-between shrink-0">
              <span className="text-[10px] font-bold tracking-[1.2px] uppercase text-slate-500 dark:text-slate-400">
                Shot Log
              </span>
              <span className="text-[11px] text-primary font-bold">
                {shotEvents.length} events detected
              </span>
            </div>
            <div className="overflow-y-auto max-h-[280px] [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-primary/20 [&::-webkit-scrollbar-thumb]:rounded-full">
              {shotEvents.length > 0 ? (
                shotEvents.map((ev, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-6 py-3 px-6 border-b border-slate-100 dark:border-border/40 cursor-pointer transition-colors hover:bg-primary/5 group"
                    onClick={() => {
                      if (videoRef.current) videoRef.current.currentTime = ev.frame / 30;
                    }}
                  >
                    <span className="text-[12px] text-primary font-bold w-12 shrink-0 tabular-nums">
                      {fmtTime(ev.frame / 30)}
                    </span>
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: shotColor(ev.type), boxShadow: `0 0 8px ${shotColor(ev.type)}` }}
                    />
                    <div className="flex-1">
                      <div className="text-[14px] text-foreground font-semibold">{ev.type}</div>
                      {ev.location_m && (
                        <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 font-light">
                          {ev.location_m[0].toFixed(2)}m, {ev.location_m[1].toFixed(2)}m
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                      seek →
                    </span>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center p-12 text-[14px] text-slate-500 dark:text-slate-400">
                  {status === "done" ? "No shots detected" : "Processing…"}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
