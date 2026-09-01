import type { Timestamp } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { shotColor } from "../utils/shotUtils";
import { fmtTime } from "../utils/timeUtils";
import LiveTracker from "../features/analysis/components/LiveTracker";
import { ShotLog } from "../features/analysis/components/ShotLog";
import { ShotStatsTab } from "../features/analysis/components/ShotStatsTab";
import { VideoTimeline } from "../features/analysis/components/VideoTimeline";
import { useAnalysisData } from "../features/analysis/hooks/useAnalysisData";
import { useCurrentTimeStore } from "../features/analysis/hooks/useCurrentTimeStore";
import type { AnalysisShot, TrackingFrame } from "../features/analysis/types";

const COCO_PAIRS: [number, number][] = [
  [0, 1], [0, 2], [1, 3], [2, 4], [5, 6], [5, 7], [7, 9],
  [6, 8], [8, 10], [5, 11], [6, 12], [11, 12], [11, 13],
  [13, 15], [12, 14], [14, 16],
];

const RALLY_GAP_SEC = 5;

// Canvas overlay colors
const COURT_LINE_COLOR = "rgba(137,194,217,0.55)";
const PLAYER_COLORS = ["#89c2d9", "#2c7da0"];
const SHUTTLE_FILL_COLOR = "#fff";

// Rally log inline styles
const RALLY_TILE_BG = "rgba(255,255,255,0.03)";
const RALLY_TILE_BORDER = "1px solid rgba(255,255,255,0.07)";
const RALLY_PROGRESS_TRACK_BG = "rgba(255,255,255,0.06)";
const RALLY_LONG_BORDER = "2px solid rgba(245,158,11,0.4)";
const RALLY_GRADIENT_LONG = "linear-gradient(90deg,#f59e0b,#d97706)";
const RALLY_GRADIENT_DEFAULT = "linear-gradient(90deg,#3B82F6,#0891b2)";

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

function groupRallies(events: AnalysisShot[], fps: number): AnalysisShot[][] {
  if (!events.length) return [];
  const sorted = [...events].sort((a, b) => a.frame - b.frame);
  const groups: AnalysisShot[][] = [];
  let current: AnalysisShot[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const gapSec = (sorted[i].frame - sorted[i - 1].frame) / fps;
    if (gapSec > RALLY_GAP_SEC) {
      groups.push(current);
      current = [];
    }
    current.push(sorted[i]);
  }
  groups.push(current);
  return groups.sort((a, b) => b.length - a.length); // longest first
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AnalysisPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const { docData, loading, urls, analysisData, status, resultsError, retryAnalysisData } =
    useAnalysisData(videoId);

  const timeStore = useCurrentTimeStore();
  const [ov, setOv] = useState({ court: true, pose: true, shuttle: true });
  const [activeTab, setActiveTab] = useState<"overview" | "shot-stats">("overview");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const renderOverlayRef = useRef<() => void>(() => {});
  const animRef = useRef<number | null>(null);

  const duration = docData?.duration ?? 0;

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

  // Keep renderOverlayRef fresh
  useEffect(() => {
    renderOverlayRef.current = () => {
      const canvas = overlayRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (!analysisData?.summary) return;

      const res = analysisData.summary.resolution;
      const sx = w / res[0], sy = h / res[1];
      const sc = (pt: [number, number]): [number, number] => [pt[0] * sx, pt[1] * sy];
      const dur = analysisData.summary.durationSec;
      const maxFrame = Math.max(
        ...(analysisData.shuttle_debug?.map((s) => s.frame) ?? [0]),
        ...(analysisData.tracking?.map((t) => t.frame) ?? [0]),
      );
      const fps = dur > 0 && maxFrame > 0 ? maxFrame / dur : 30;
      const frame = Math.round((videoRef.current?.currentTime ?? 0) * fps);

      if (ov.court && analysisData.geometry?.court_keypoints_35) {
        const kp = analysisData.geometry.court_keypoints_35;
        ctx.strokeStyle = COURT_LINE_COLOR;
        ctx.lineWidth = 1.5;
        for (let row = 0; row < 7; row++) {
          for (let col = 0; col < 5; col++) {
            const idx = row * 5 + col;
            if (!kp[idx]) continue;
            const [x, y] = sc(kp[idx]);
            if (col < 4 && kp[idx + 1]) {
              const [nx, ny] = sc(kp[idx + 1]);
              ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
            }
            if (row < 6 && kp[idx + 5]) {
              const [nx, ny] = sc(kp[idx + 5]);
              ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
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
          entry.players.forEach((player, pi) => {
            const color = PLAYER_COLORS[pi % 2];
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            COCO_PAIRS.forEach(([a, b]) => {
              const pa = player.skeleton[a], pb = player.skeleton[b];
              if (!pa || !pb) return;
              if (pa[0] === 0 && pa[1] === 0) return;
              if (pb[0] === 0 && pb[1] === 0) return;
              const [ax, ay] = sc(pa), [bx, by] = sc(pb);
              ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
            });
            ctx.fillStyle = color;
            player.skeleton.forEach((pt) => {
              if (!pt || (pt[0] === 0 && pt[1] === 0)) return;
              const [x, y] = sc(pt);
              ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
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
          ctx.shadowColor = PLAYER_COLORS[0];
          ctx.fillStyle = SHUTTLE_FILL_COLOR;
          ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    };
  }, [analysisData, ov, trackingByFrame, shuttleByFrame]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const update = () => {
      timeStore.set(v.currentTime);
      renderOverlayRef.current();
      animRef.current = requestAnimationFrame(update);
    };
    animRef.current = requestAnimationFrame(update);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [urls, timeStore]);

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

  const toggleOv = (k: keyof typeof ov) =>
    setOv((prev) => ({ ...prev, [k]: !prev[k] }));

  const shotEvents = useMemo<AnalysisShot[]>(
    () => analysisData?.events ?? [],
    [analysisData],
  );

  const shuttleVisibility = useMemo(() => {
    if (!analysisData?.shuttle_debug?.length) return null;
    const detected = analysisData.shuttle_debug.filter((s) => s.pos !== null).length;
    const total = analysisData.shuttle_debug.length;
    return { detected, total, pct: Math.round((detected / total) * 100) };
  }, [analysisData]);

  const fps = useMemo(() => {
    if (!analysisData?.summary) return 30;
    const dur = analysisData.summary.durationSec;
    const maxFrame = Math.max(
      ...(analysisData.shuttle_debug?.map((s) => s.frame) ?? [0]),
      ...(analysisData.tracking?.map((t) => t.frame) ?? [0]),
    );
    return dur > 0 && maxFrame > 0 ? maxFrame / dur : 30;
  }, [analysisData]);

  const rallies = useMemo(
    () => groupRallies(shotEvents, fps),
    [shotEvents, fps],
  );

  const metaLine = [
    fmtDate(docData?.createdAt),
    duration ? fmtTime(duration) : null,
    docData?.totalShots != null ? `${docData.totalShots} shots detected` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const TABS = [
    { id: "overview" as const, label: "Overview" },
    { id: "shot-stats" as const, label: "Shot Stats" },
  ];

  return (
    <main className="flex-1 flex flex-col min-w-0 overflow-y-auto w-full"><div className="max-w-[1500px] mx-auto px-8 py-8 flex flex-col gap-6 w-full">
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
            {analysisData?.summary?.truncated && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 shrink-0">
                Truncated — showing a partial result
              </span>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border shrink-0 -mb-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
                  activeTab === tab.id
                    ? "border-primary text-foreground"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {resultsError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between gap-3 shrink-0">
              <span>Couldn't load the full analysis data. Shot log, rally map, and stats may be missing.</span>
              <button
                onClick={retryAnalysisData}
                className="text-[12px] font-semibold underline underline-offset-2 shrink-0 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* ── OVERVIEW TAB ── */}
          {activeTab === "overview" && (
            <div className="flex flex-col gap-4">
              {/* 3-column grid: shot log | video | rally map */}
              <div
                className="grid gap-4 items-stretch"
                style={{
                  gridTemplateColumns: "260px minmax(0,1fr) 300px",
                  gridTemplateRows: "clamp(540px, 65vh, 780px)",
                }}
              >
                {/* Shot log */}
                <ShotLog
                  shotEvents={shotEvents}
                  fps={fps}
                  videoRef={videoRef}
                  status={status}
                  store={timeStore}
                />

                {/* Video player */}
                <div className="dark:bg-card bg-white border border-border rounded-xl overflow-hidden flex flex-col">
                  <div className="relative w-full flex-1 min-h-0 bg-video-canvas flex items-center justify-center cursor-pointer group overflow-hidden">
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
                      <div className="w-12 h-12 rounded-full bg-primary/10 border-[1.5px] border-primary/30 flex items-center justify-center opacity-65 group-hover:opacity-100 transition-opacity">
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
                                : "border-primary/20 bg-video-chrome/80 text-slate-400 dark:text-slate-500"
                            }`}
                          >
                            {k.charAt(0).toUpperCase() + k.slice(1)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Timeline */}
                  <VideoTimeline
                    duration={duration}
                    shotEvents={shotEvents}
                    fps={fps}
                    videoRef={videoRef}
                    store={timeStore}
                  />
                </div>

                {/* Live rally map */}
                <LiveTracker analysisData={analysisData} store={timeStore} />
              </div>

              {/* Tracking mini-stats row */}
              {analysisData && (
                <div className="grid grid-cols-4 gap-3 shrink-0">
                  {[
                    {
                      label: "Total shots",
                      value: docData.totalShots ?? "—",
                      color: "text-primary",
                    },
                    {
                      label: "Shuttle visibility",
                      value: shuttleVisibility ? `${shuttleVisibility.pct}%` : "—",
                      color: "text-primary",
                    },
                    {
                      label: "Duration",
                      value: duration ? fmtTime(duration) : "—",
                      color: "text-foreground",
                    },
                    {
                      label: "Court detected",
                      value: analysisData.geometry?.court_keypoints_6 ? "Yes" : "No",
                      color: analysisData.geometry?.court_keypoints_6
                        ? "text-green-400"
                        : "text-slate-400",
                    },
                  ].map(({ label, value, color }) => (
                    <div
                      key={label}
                      className="dark:bg-card bg-white border border-border rounded-xl p-4"
                    >
                      <div className="text-[10px] font-bold tracking-[.8px] uppercase text-slate-500 dark:text-slate-400 mb-1">
                        {label}
                      </div>
                      <div className={`text-[20px] font-bold tracking-tight tabular-nums ${color}`}>
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Rally log */}
              {rallies.length > 0 && (
                <div className="dark:bg-card bg-white border border-border rounded-xl overflow-hidden shrink-0">
                  <div className="py-2.5 px-5 border-b border-border flex items-center justify-between">
                    <span className="text-[10px] font-bold tracking-[1.2px] uppercase text-slate-500 dark:text-slate-400">
                      Rally Log
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {rallies.length} {rallies.length === 1 ? "rally" : "rallies"} · avg{" "}
                      {Math.round(
                        rallies.reduce((s, r) => s + r.length, 0) / rallies.length,
                      )}{" "}
                      shots
                    </span>
                  </div>

                  {/* Summary tiles */}
                  <div className="grid grid-cols-4 gap-3 p-4 border-b border-border">
                    {[
                      { label: "Rallies", value: rallies.length, color: "text-primary" },
                      {
                        label: "Longest",
                        value: Math.max(...rallies.map((r) => r.length)),
                        sub: "shots",
                        color: "text-amber-400",
                      },
                      {
                        label: "Avg length",
                        value: (
                          rallies.reduce((s, r) => s + r.length, 0) / rallies.length
                        ).toFixed(1),
                        sub: "shots",
                        color: "text-foreground",
                      },
                      {
                        label: "> 5 shots",
                        value: `${Math.round((rallies.filter((r) => r.length > 5).length / rallies.length) * 100)}%`,
                        color: "text-green-400",
                      },
                    ].map(({ label, value, sub, color }) => (
                      <div
                        key={label}
                        className="rounded-lg p-3"
                        style={{ background: RALLY_TILE_BG, border: RALLY_TILE_BORDER }}
                      >
                        <div className="text-[9px] font-bold uppercase tracking-[.8px] text-slate-500 dark:text-slate-400 mb-1">
                          {label}
                        </div>
                        <div className={`text-[22px] font-bold tracking-tight tabular-nums ${color}`}>
                          {value}
                        </div>
                        {sub && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                            {sub}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Rally rows */}
                  <div
                    className="overflow-y-auto max-h-[220px] [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-primary/20 [&::-webkit-scrollbar-thumb]:rounded-full"
                  >
                    {rallies.map((rally, i) => {
                      const startSec = rally[0].frame / fps;
                      const endSec = rally[rally.length - 1].frame / fps;
                      const durationSec = endSec - startSec;
                      const isLong = rally.length > 5;
                      return (
                        <div
                          key={i}
                          className="flex items-center gap-4 px-5 py-3 border-b border-slate-100 dark:border-border/40 cursor-pointer hover:bg-primary/5 transition-colors"
                          style={isLong ? { borderLeft: RALLY_LONG_BORDER } : {}}
                          onClick={() => {
                            if (videoRef.current) videoRef.current.currentTime = startSec;
                          }}
                        >
                          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 w-5 shrink-0">
                            #{i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 mb-1.5 tabular-nums">
                              {fmtTime(startSec)} – {fmtTime(endSec)} · {Math.round(durationSec)}s
                            </div>
                            {/* Progress bar proportional to shot count */}
                            <div
                              className="h-[3px] rounded-full mb-1.5 overflow-hidden"
                              style={{ background: RALLY_PROGRESS_TRACK_BG }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${(rally.length / Math.max(...rallies.map((r) => r.length))) * 100}%`,
                                  background: isLong ? RALLY_GRADIENT_LONG : RALLY_GRADIENT_DEFAULT,
                                }}
                              />
                            </div>
                            {/* Shot type dots */}
                            <div className="flex gap-1 flex-wrap">
                              {rally.map((s, j) => (
                                <span
                                  key={j}
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ background: shotColor(s.type) }}
                                />
                              ))}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div
                              className={`text-[15px] font-bold tabular-nums leading-none ${isLong ? "text-amber-400" : "text-foreground"}`}
                            >
                              {rally.length}
                            </div>
                            <div className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5">
                              shots
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {rallies.length > 8 && (
                    <div className="py-2.5 text-center text-[11px] text-slate-500 dark:text-slate-400">
                      Showing all {rallies.length} rallies
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── SHOT STATS TAB ── */}
          {activeTab === "shot-stats" && (
            <ShotStatsTab
              shotEvents={shotEvents}
              totalShots={docData.totalShots}
              status={status}
            />
          )}
        </>
      )}
    </div></main>
  );
}
