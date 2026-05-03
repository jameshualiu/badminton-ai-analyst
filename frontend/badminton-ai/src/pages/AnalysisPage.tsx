import { Timestamp, doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useOutletContext } from "react-router-dom";
import { db } from "../lib/firebase";
import { useAuthUser } from "../auth/hooks/useAuthUser";
import { shotColor } from "../features/analysis/shotUtils";
import type { AnalysisData, TrackingFrame, VideoStatus } from "../features/analysis/types";

const COCO_PAIRS: [number, number][] = [
  [0,1],[0,2],[1,3],[2,4],
  [5,6],[5,7],[7,9],[6,8],[8,10],
  [5,11],[6,12],[11,12],
  [11,13],[13,15],[12,14],[14,16],
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

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api/v1";

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtDate(ts: Timestamp | undefined): string {
  if (!ts?.toDate) return "";
  return ts.toDate().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function AnalysisPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const { activeAnalysisView: activeView } = useOutletContext<{ activeAnalysisView: string }>();
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
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) setDocData(snap.data() as FirestoreVideoDoc);
      else setDocData(null);
      setLoading(false);
    }, err => { console.error(err); setLoading(false); });
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
        const res = await fetch(`${API_BASE}/videos/${videoId}/results`, { headers: { Authorization: `Bearer ${token}` } });
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
            } catch (e) { console.error(e); }
          }
        }
      } catch (e) { console.error(e); }
    })();
    return () => { cancelled = true; };
  }, [user, videoId, status]);

  const duration = docData?.duration ?? 0;
  const pct = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  const trackingByFrame = useMemo(() => {
    const m = new Map<number, TrackingFrame>();
    analysisData?.tracking?.forEach(e => m.set(e.frame, e));
    return m;
  }, [analysisData]);

  const shuttleByFrame = useMemo(() => {
    const m = new Map<number, { frame: number; pos: [number, number] | null; confidence: number }>();
    analysisData?.shuttle_debug?.forEach(e => m.set(e.frame, e));
    return m;
  }, [analysisData]);

  // Keep renderOverlayRef fresh so the RAF loop never captures stale deps
  useEffect(() => {
    renderOverlayRef.current = () => {
      const canvas = overlayRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      if (!analysisData) return;

      const res = analysisData.summary.resolution;
      const sx = w / res[0], sy = h / res[1];
      const sc = (pt: [number, number]): [number, number] => [pt[0] * sx, pt[1] * sy];
      const dur = analysisData.summary.durationSec;
      const maxFrame = Math.max(
        ...(analysisData.shuttle_debug?.map(s => s.frame) ?? [0]),
        ...(analysisData.tracking?.map(t => t.frame) ?? [0]),
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
        const entry = trackingByFrame.get(frame) ?? trackingByFrame.get(frame - 1) ?? trackingByFrame.get(frame + 1);
        if (entry) {
          const playerColors = ["#89c2d9", "#2c7da0"];
          entry.players.forEach((player, pi) => {
            const color = playerColors[pi % 2];
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            COCO_PAIRS.forEach(([a, b]) => {
              const pa = player.skeleton[a], pb = player.skeleton[b];
              if (!pa || !pb) return;
              const [ax, ay] = sc(pa); const [bx, by] = sc(pb);
              ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
            });
            ctx.fillStyle = color;
            player.skeleton.forEach(pt => {
              if (!pt) return;
              const [x, y] = sc(pt);
              ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill();
            });
          });
        }
      }

      if (ov.shuttle && analysisData.shuttle_debug?.length) {
        const entry = shuttleByFrame.get(frame) ?? shuttleByFrame.get(frame - 1) ?? shuttleByFrame.get(frame + 1);
        if (entry?.pos) {
          const [x, y] = sc(entry.pos);
          ctx.shadowBlur = 5; ctx.shadowColor = "#89c2d9";
          ctx.fillStyle = "#fff";
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
      setCurrentTime(v.currentTime);
      renderOverlayRef.current();
      animRef.current = requestAnimationFrame(update);
    };
    animRef.current = requestAnimationFrame(update);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
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

  const toggleOv = (k: keyof typeof ov) => setOv(prev => ({ ...prev, [k]: !prev[k] }));

  const shotEvents: import("../features/analysis/types").AnalysisShot[] = analysisData?.events ?? [];
  const metaLine = [
    fmtDate(docData?.createdAt),
    duration ? fmtTime(duration) : null,
    docData?.totalShots != null ? `${docData.totalShots} shots detected` : null,
  ].filter(Boolean).join(" · ");

  return (
    <main className="flex-1 p-8 flex flex-col gap-6 min-w-0 overflow-y-auto max-w-[1400px]">
      {loading ? (
        <div className="flex items-center justify-center p-8 text-[14px] text-muted">Loading your analysis…</div>
      ) : !docData ? (
        <div className="flex items-center justify-center p-8 text-[14px] text-muted">Analysis not found</div>
      ) : (
        <>
          {/* Page header */}
          <div className="flex items-center justify-between shrink-0">
            <div>
              <div className="text-[24px] font-semibold tracking-[-0.6px]">{docData.title ?? "Match Analysis"}</div>
              {metaLine && <div className="text-[14px] text-muted mt-0.5 font-light">{metaLine}</div>}
            </div>
          </div>

          {/* Top grid: video + tracker */}
          <div className="grid grid-cols-[2fr_1fr] gap-4 items-stretch shrink-0" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(220px, 320px)" }}>
            {/* Video */}
            <div className="bg-surface border border-border rounded-2xl overflow-hidden flex flex-col">
              <div className="relative w-full aspect-video bg-[#04080d] flex items-center justify-center cursor-pointer group">
                {urls.annotatedVideo || urls.originalVideo ? (
                  <video
                    ref={videoRef}
                    src={urls.annotatedVideo || urls.originalVideo}
                    className="w-full h-full object-contain block"
                    onClick={e => {
                      const v = e.currentTarget;
                      if (v.paused) v.play();
                      else v.pause();
                    }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary/10 border-[1.5px] border-primary/30 flex items-center justify-center opacity-65 transition-opacity group-hover:opacity-100">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 3l9 5-9 5V3z" fill="currentColor" className="text-primary"/></svg>
                  </div>
                )}
                <span className="absolute top-3 left-4 text-[11px] text-muted font-light pointer-events-none">{docData.title ?? videoId}</span>
                {duration > 0 && <span className="absolute top-3 right-4 text-[11px] text-muted pointer-events-none">{fmtTime(duration)}</span>}
                <canvas className="absolute inset-0 w-full h-full pointer-events-none" ref={overlayRef} />
                {analysisData && (
                  <div className="absolute bottom-3 left-4 flex gap-2">
                    {(["court", "pose", "shuttle"] as const).map(k => (
                      <button key={k} onClick={() => toggleOv(k)}
                        className={`text-[10px] font-medium py-1 px-2.5 rounded-lg border cursor-pointer transition-all ${
                          ov[k] ? "bg-primary/15 border-primary/40 text-primary" : "border-primary/20 bg-[#080c10]/80 text-muted"
                        }`}>
                        {k.charAt(0).toUpperCase() + k.slice(1)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Timeline */}
              <div className="p-4 px-5 pb-5 border-t border-border">
                <div className="relative h-8 flex items-center cursor-pointer select-none" ref={tlRef} onMouseDown={handleTlMouseDown}>
                  <div className="w-full h-[3px] bg-primary/10 rounded-full">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${pct * 100}%` }} />
                  </div>
                  {/* Shot markers */}
                  {shotEvents.map((ev, i) => {
                    const evPct = duration > 0 ? ((ev.frame / 30) / duration) * 100 : 0;
                    const c = shotColor(ev.type);
                    return (
                      <div key={i} className="absolute -translate-x-1/2 w-[6px] h-[6px] rounded-full border border-[#080c10] transition-transform hover:scale-[1.8]" style={{ left: `${evPct}%`, background: c, boxShadow: `0 0 8px ${c}80` }} />
                    );
                  })}
                  <div className="absolute w-[13px] h-[13px] rounded-full bg-white border-2 border-primary -translate-x-1/2 pointer-events-none shadow-md" style={{ left: `${pct * 100}%` }} />
                </div>
                <div className="flex justify-between mt-2">
                  <span className="text-[12px] text-primary font-semibold tabular-nums">{fmtTime(currentTime)}</span>
                  <span className="text-[12px] text-muted font-light tabular-nums">{fmtTime(duration)}</span>
                </div>
              </div>
            </div>

            {/* Tracker canvas */}
            <div className="bg-surface border border-border rounded-2xl flex flex-col overflow-hidden">
              <div className="py-2.5 px-4 border-b border-border flex items-center justify-between shrink-0">
                <span className="text-[10px] font-bold tracking-[1.2px] uppercase text-muted">Live tracker</span>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center p-6 gap-2">
                <div className="text-[11px] text-muted/50 font-medium text-center">Tracking data available<br />after analysis completes</div>
              </div>
            </div>
          </div>

          {/* Bottom views */}
          <div className="grid grid-cols-1 gap-4">
            {activeView === "overlay" && (
              <div className="grid grid-cols-[1fr_1fr_2fr] gap-4">
                <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-2">
                  <div className="text-[10px] font-bold tracking-[1px] uppercase text-muted">Total shots</div>
                  <div className="text-[28px] font-bold tracking-[-1px] leading-none text-primary">{docData.totalShots ?? "—"}</div>
                  {analysisData?.summary.shotCounts && Object.keys(analysisData.summary.shotCounts).length > 0 && (
                    <div className="mt-1 flex flex-col gap-1.5">
                      {Object.entries(analysisData.summary.shotCounts).map(([type, count]) => (
                        <div key={type} className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: shotColor(type) }} />
                          <span className="text-[11px] text-muted">{type}</span>
                          <span className="text-[11px] font-bold ml-auto tabular-nums">{count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="bg-surface border border-border rounded-2xl p-5">
                  <div className="text-[10px] font-bold tracking-[1px] uppercase text-muted mb-2">Duration</div>
                  <div className="text-[28px] font-bold tracking-[-1px] leading-none">{duration ? fmtTime(duration) : "—"}</div>
                  <div className="text-[11px] text-muted/60 mt-2 font-medium">mm:ss</div>
                </div>
                <div className="bg-surface border border-border rounded-2xl overflow-hidden flex flex-col">
                  <div className="py-2.5 px-5 border-b border-border flex items-center justify-between shrink-0">
                    <span className="text-[10px] font-bold tracking-[1.2px] uppercase text-muted">Shot log</span>
                  </div>
                  <div className="max-h-[160px] overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-primary/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                    {shotEvents.length > 0 ? shotEvents.map((ev, i) => (
                      <div key={i} className="flex items-center gap-4 py-2.5 px-5 border-b border-border/40 cursor-default transition-colors hover:bg-primary/5 group">
                        <span className="text-[12px] text-primary font-bold w-10 shrink-0 tabular-nums">{fmtTime(ev.frame / 30)}</span>
                        <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: shotColor(ev.type), boxShadow: `0 0 5px ${shotColor(ev.type)}` }} />
                        <span className="text-[13.5px] text-foreground font-medium">{ev.type}</span>
                        {ev.location_m && (
                          <span className="text-[11px] text-muted ml-auto font-light">{ev.location_m[0].toFixed(1)},{ev.location_m[1].toFixed(1)}m</span>
                        )}
                      </div>
                    )) : (
                      <div className="flex items-center justify-center p-8 text-[14px] text-muted">{status === "done" ? "No shots detected" : "Processing…"}</div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeView === "metrics" && (
              <div className="grid grid-cols-[1fr_1fr_2fr] gap-4">
                <div className="bg-surface border border-border rounded-2xl p-5">
                  <div className="text-[10px] font-bold tracking-[1px] uppercase text-muted mb-4">Match</div>
                  <div className="flex items-center justify-between mb-3"><span className="text-[13px] text-muted">Duration</span><span className="text-[18px] font-bold">{duration ? fmtTime(duration) : "—"}</span></div>
                  <div className="h-1 bg-primary/10 rounded-full overflow-hidden mb-3"><div className="h-full bg-primary" style={{ width: "100%" }} /></div>
                  <div className="flex items-center justify-between"><span className="text-[13px] text-muted">Shots</span><span className="text-[18px] font-bold text-primary">{docData.totalShots ?? "—"}</span></div>
                </div>
                <div className="bg-surface border border-border rounded-2xl p-5">
                  <div className="text-[10px] font-bold tracking-[1px] uppercase text-muted mb-4">Shuttle</div>
                  <div className="flex items-center justify-between mb-3"><span className="text-[13px] text-muted">Detected</span><span className="text-[18px] font-bold text-primary">{analysisData?.shuttle_debug?.filter(s => s.pos !== null).length ?? "—"}</span></div>
                  <div className="h-1 bg-primary/10 rounded-full overflow-hidden mb-3"><div className="h-full bg-primary" style={{ width: "65%" }} /></div>
                  <div className="flex items-center justify-between"><span className="text-[13px] text-muted">Frames</span><span className="text-[18px] font-bold">{analysisData?.shuttle_debug?.length ?? "—"}</span></div>
                </div>
                <div className="bg-surface border border-border rounded-2xl p-5">
                  <div className="text-[10px] font-bold tracking-[1px] uppercase text-muted mb-4">Court</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-0.5">
                      <div className="text-[12px] text-muted font-light">Detection</div>
                      <div className="text-[15px] font-bold text-primary">{analysisData?.geometry?.court_keypoints_6 ? "✓ Success" : "—"}</div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-[12px] text-muted font-light">Resolution</div>
                      <div className="text-[15px] font-bold">{analysisData?.summary.resolution?.join(" × ") ?? "—"}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeView === "shots" && (
              <div className="bg-surface border border-border rounded-2xl overflow-hidden flex flex-col">
                <div className="py-2.5 px-5 border-b border-border flex items-center justify-between shrink-0">
                  <span className="text-[10px] font-bold tracking-[1.2px] uppercase text-muted">Detailed Shot Log</span>
                  <span className="text-[11px] text-primary font-bold">{shotEvents.length} events detected</span>
                </div>
                <div className="max-h-[300px] overflow-y-auto [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-primary/20 [&::-webkit-scrollbar-thumb]:rounded-full">
                  {shotEvents.length > 0 ? shotEvents.map((ev, i) => (
                    <div key={i} className="flex items-center gap-6 py-3 px-6 border-b border-border/40 cursor-default transition-colors hover:bg-primary/5 group">
                      <span className="text-[13px] text-primary font-bold w-12 shrink-0 tabular-nums">{fmtTime(ev.frame / 30)}</span>
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: shotColor(ev.type), boxShadow: `0 0 8px ${shotColor(ev.type)}` }} />
                      <div className="flex-1">
                        <div className="text-[15px] text-foreground font-semibold">{ev.type}</div>
                        {ev.location_m && (
                          <div className="text-[11px] text-muted/60 mt-0.5 font-light">Coordinates: {ev.location_m[0].toFixed(2)}m, {ev.location_m[1].toFixed(2)}m</div>
                        )}
                      </div>
                    </div>
                  )) : (
                    <div className="flex items-center justify-center p-12 text-[14px] text-muted">No shots detected in this video analysis.</div>
                  )}
                </div>
              </div>
            )}

            {activeView === "tracker" && (
              <div className="grid grid-cols-[1fr_1fr_2fr] gap-4">
                <div className="bg-surface border border-border rounded-2xl p-5">
                  <div className="text-[10px] font-bold tracking-[1px] uppercase text-muted mb-2">P1 position</div>
                  <div className="text-[18px] font-bold text-primary">Near side</div>
                  <div className="text-[11px] text-muted/60 mt-1 font-light italic">estimated depth</div>
                </div>
                <div className="bg-surface border border-border rounded-2xl p-5">
                  <div className="text-[10px] font-bold tracking-[1px] uppercase text-muted mb-2">P2 position</div>
                  <div className="text-[18px] font-bold text-[#2c7da0]">Far side</div>
                  <div className="text-[11px] text-muted/60 mt-1 font-light italic">estimated depth</div>
                </div>
                <div className="bg-surface border border-border rounded-2xl p-5">
                  <div className="text-[10px] font-bold tracking-[1px] uppercase text-muted mb-2">Tracking Confidence</div>
                  <div className="text-[28px] font-bold tracking-[-1px] leading-none text-primary">
                    {analysisData?.shuttle_debug
                      ? `${Math.round((analysisData.shuttle_debug.filter(s => s.pos !== null).length / analysisData.shuttle_debug.length) * 100)}%`
                      : "—"}
                  </div>
                  <div className="text-[11px] text-muted/60 mt-2 font-medium">shuttle visibility score</div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
