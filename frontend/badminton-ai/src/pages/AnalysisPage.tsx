import { Timestamp, doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { db } from "../lib/firebase";
import { useAuthUser } from "../auth/hooks/useAuthUser";
import { shotColor, SHOT_COLORS } from "../utils/shotUtils";
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

const RALLY_GAP_SEC = 5;

// Court SVG dimensions (matches the heatmap SVG)
const SVG_COURT = { x: 16, y: 20, w: 98, h: 232 };
const COURT_M = { w: 6.1, h: 13.4 };

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

// Maps location_m [x, y] → SVG coordinate
function toSvgCoord(loc: [number, number]): { cx: number; cy: number } {
  return {
    cx: SVG_COURT.x + (loc[0] / COURT_M.w) * SVG_COURT.w,
    cy: SVG_COURT.y + (loc[1] / COURT_M.h) * SVG_COURT.h,
  };
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

// ─── Court heatmap SVG ────────────────────────────────────────────────────────
function CourtHeatmap({
  shots,
  selectedType,
}: {
  shots: AnalysisShot[];
  selectedType: string;
}) {
  const filtered = selectedType === "all"
    ? shots
    : shots.filter((s) => s.type === selectedType);

  const positioned = filtered.filter((s) => s.location_m !== null) as (AnalysisShot & {
    location_m: [number, number];
  })[];

  return (
    <svg
      viewBox="0 0 130 272"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full block"
      style={{ maxWidth: 160 }}
    >
      {/* Dark surround */}
      <rect width="130" height="272" fill="rgba(8,16,28,0.9)" rx="4" />
      {/* Court surface — green */}
      <rect x="16" y="20" width="98" height="232" fill="rgba(22,78,46,0.8)" />

      {/* Court lines */}
      {/* Outer doubles boundary */}
      <rect x="16" y="20" width="98" height="232" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.2" />
      {/* Singles sidelines — full length */}
      <line x1="23" y1="20" x2="23" y2="252" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" />
      <line x1="107" y1="20" x2="107" y2="252" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" />
      {/* Long service lines (doubles back) */}
      <line x1="16" y1="32" x2="114" y2="32" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" />
      <line x1="16" y1="240" x2="114" y2="240" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" />
      {/* Short service lines */}
      <line x1="16" y1="105" x2="114" y2="105" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" />
      <line x1="16" y1="167" x2="114" y2="167" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" />
      {/* Centre service lines — one per half, not crossing net */}
      <line x1="65" y1="32" x2="65" y2="105" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" />
      <line x1="65" y1="167" x2="65" y2="240" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" />
      {/* Net — on top */}
      <line x1="16" y1="136" x2="114" y2="136" stroke="rgba(255,255,255,0.95)" strokeWidth="2" />
      <text x="117" y="139" fontSize="5.5" fill="rgba(255,255,255,0.3)" fontFamily="sans-serif">NET</text>

      {/* Shot dots */}
      {positioned.length === 0 && (
        <text x="65" y="140" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.2)" fontFamily="sans-serif">
          no position data
        </text>
      )}
      {positioned.map((s, i) => {
        const { cx, cy } = toSvgCoord(s.location_m);
        const color = shotColor(s.type);
        const fade = selectedType === "all" ? 0.75 : 0.85;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r="3.5"
            fill={color}
            opacity={fade}
          />
        );
      })}
    </svg>
  );
}

// ─── Shot Stats tab ───────────────────────────────────────────────────────────
function ShotStatsTab({
  shotEvents,
  totalShots,
  status,
}: {
  shotEvents: AnalysisShot[];
  totalShots: number | null | undefined;
  status: string;
}) {
  const [selectedType, setSelectedType] = useState("all");

  const shotTypes = useMemo(
    () => Object.keys(SHOT_COLORS).filter((t) => t !== "Unknown"),
    [],
  );

  const shotCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    shotEvents.forEach((s) => {
      counts[s.type] = (counts[s.type] ?? 0) + 1;
    });
    return counts;
  }, [shotEvents]);

  const sortedTypes = useMemo(
    () =>
      Object.entries(shotCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([t]) => t),
    [shotCounts],
  );

  const maxCount = sortedTypes.length
    ? (shotCounts[sortedTypes[0]] ?? 1)
    : 1;

  const transitions = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (let i = 0; i < shotEvents.length - 1; i++) {
      const from = shotEvents[i].type;
      const to = shotEvents[i + 1].type;
      if (!map[from]) map[from] = {};
      map[from][to] = (map[from][to] ?? 0) + 1;
    }
    return map;
  }, [shotEvents]);

  const topTransitions = useMemo(() => {
    return sortedTypes.slice(0, 4).map((from) => {
      const toMap = transitions[from] ?? {};
      const tos = Object.entries(toMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);
      const total = tos.reduce((s, [, n]) => s + n, 0);
      return {
        from,
        tos: tos.map(([type, count]) => ({
          type,
          count,
          pct: total > 0 ? Math.round((count / total) * 100) : 0,
        })),
      };
    });
  }, [sortedTypes, transitions]);

  const empty = shotEvents.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Pill filter */}
      <div className="flex flex-wrap gap-2">
        {["all", ...shotTypes].map((type) => {
          const active = selectedType === type;
          const color = type === "all" ? "#3B82F6" : shotColor(type);
          return (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className="px-3 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer"
              style={
                active
                  ? {
                      borderColor: color,
                      color,
                      background: `${color}18`,
                    }
                  : {
                      borderColor: "rgba(255,255,255,0.10)",
                      color: "rgba(147,197,253,0.55)",
                      background: "transparent",
                    }
              }
            >
              {type === "all" ? "All shots" : type}
            </button>
          );
        })}
      </div>

      {/* Heatmap + distribution */}
      <div className="grid grid-cols-2 gap-4">
        {/* Heatmap */}
        <div className="dark:bg-card bg-white border border-border rounded-xl p-5">
          <div className="text-[10px] font-bold tracking-[1px] uppercase text-slate-500 dark:text-slate-400 mb-4">
            Shot Heatmap
          </div>
          {empty ? (
            <div className="text-[12px] text-slate-400 dark:text-slate-500">
              {status === "done" ? "No position data" : "Processing…"}
            </div>
          ) : (
            <div className="flex gap-4 items-start">
              {/* SVG court */}
              <div className="shrink-0 w-[130px]">
                <CourtHeatmap shots={shotEvents} selectedType={selectedType} />
              </div>
              {/* Legend + bars */}
              <div className="flex flex-col gap-2 flex-1 justify-center">
                {sortedTypes.map((type) => {
                  const count = shotCounts[type] ?? 0;
                  const pct = totalShots ? (count / totalShots) * 100 : 0;
                  const color = shotColor(type);
                  const faded =
                    selectedType !== "all" && selectedType !== type;
                  return (
                    <div
                      key={type}
                      className="flex items-center gap-2 transition-opacity"
                      style={{ opacity: faded ? 0.22 : 1 }}
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: color }}
                      />
                      <span
                        className="text-[11px] font-medium w-9 shrink-0"
                        style={{ color: "rgba(147,197,253,0.65)" }}
                      >
                        {type}
                      </span>
                      <div
                        className="flex-1 h-1 rounded-full overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.06)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${(count / maxCount) * 100}%`,
                            background: color,
                          }}
                        />
                      </div>
                      <span className="text-[12px] font-bold tabular-nums text-foreground w-5 text-right">
                        {count}
                      </span>
                      <span
                        className="text-[10px] tabular-nums w-8 text-right"
                        style={{ color: "rgba(147,197,253,0.35)" }}
                      >
                        {Math.round(pct)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Shot count tiles + insight */}
        <div className="dark:bg-card bg-white border border-border rounded-xl p-5">
          <div className="text-[10px] font-bold tracking-[1px] uppercase text-slate-500 dark:text-slate-400 mb-4">
            Shot Breakdown
          </div>
          {empty ? (
            <div className="text-[12px] text-slate-400 dark:text-slate-500">
              {status === "done" ? "No data" : "Processing…"}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2 mb-1">
                <div
                  className="rounded-lg p-3"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="text-[9px] font-bold uppercase tracking-[.8px] text-slate-500 dark:text-slate-400 mb-1">
                    Total
                  </div>
                  <div className="text-[22px] font-bold tracking-tight text-primary tabular-nums">
                    {totalShots ?? "—"}
                  </div>
                </div>
                <div
                  className="rounded-lg p-3"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="text-[9px] font-bold uppercase tracking-[.8px] text-slate-500 dark:text-slate-400 mb-1">
                    Top shot
                  </div>
                  <div
                    className="text-[14px] font-bold"
                    style={{ color: sortedTypes[0] ? shotColor(sortedTypes[0]) : undefined }}
                  >
                    {sortedTypes[0] ?? "—"}
                  </div>
                </div>
                <div
                  className="rounded-lg p-3"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="text-[9px] font-bold uppercase tracking-[.8px] text-slate-500 dark:text-slate-400 mb-1">
                    Types
                  </div>
                  <div className="text-[22px] font-bold tracking-tight tabular-nums">
                    {sortedTypes.length}
                  </div>
                </div>
              </div>

              {/* Per-type rows */}
              <div className="flex flex-col gap-2.5 mt-1">
                {sortedTypes.map((type) => {
                  const count = shotCounts[type] ?? 0;
                  const pct = totalShots ? (count / totalShots) * 100 : 0;
                  const color = shotColor(type);
                  const faded =
                    selectedType !== "all" && selectedType !== type;
                  return (
                    <div
                      key={type}
                      className="transition-opacity"
                      style={{ opacity: faded ? 0.22 : 1 }}
                    >
                      <div className="flex justify-between mb-1">
                        <span className="text-[11px] flex items-center gap-1.5" style={{ color: "rgba(147,197,253,0.65)" }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0 inline-block" style={{ background: color }} />
                          {type}
                        </span>
                        <span className="text-[11px] font-bold tabular-nums">{count}</span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transition tendencies */}
      {topTransitions.length > 0 && (
        <div className="dark:bg-card bg-white border border-border rounded-xl p-5">
          <div className="text-[10px] font-bold tracking-[1px] uppercase text-slate-500 dark:text-slate-400 mb-4">
            Shot Transition Tendencies
          </div>
          <div className="grid grid-cols-2 gap-x-10 gap-y-0">
            {topTransitions.map(({ from, tos }) => (
              <div
                key={from}
                className="flex items-start gap-3 py-2.5 border-t border-border first:border-t-0"
              >
                <div className="flex items-center gap-1.5 w-14 shrink-0 pt-0.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: shotColor(from) }}
                  />
                  <span className="text-[11px] font-medium" style={{ color: "rgba(147,197,253,0.65)" }}>
                    {from}
                  </span>
                </div>
                <span className="text-[11px] pt-0.5" style={{ color: "rgba(147,197,253,0.3)" }}>→</span>
                <div className="flex flex-wrap gap-1.5">
                  {tos.map(({ type, pct }, i) => (
                    <span
                      key={type}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold border"
                      style={
                        i === 0
                          ? {
                              background: `${shotColor(type)}12`,
                              borderColor: `${shotColor(type)}35`,
                              color: shotColor(type),
                            }
                          : {
                              background: "rgba(255,255,255,0.03)",
                              borderColor: "rgba(255,255,255,0.08)",
                              color: "rgba(147,197,253,0.55)",
                            }
                      }
                    >
                      <span
                        className="w-1 h-1 rounded-full"
                        style={{ background: shotColor(type) }}
                      />
                      {type}
                      <span style={{ color: "rgba(147,197,253,0.35)" }}>{pct}%</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AnalysisPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const { user } = useAuthUser();

  const [docData, setDocData] = useState<FirestoreVideoDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [urls, setUrls] = useState<Partial<Record<string, string>>>({});
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [ov, setOv] = useState({ court: true, pose: true, shuttle: true });
  const [activeTab, setActiveTab] = useState<"overview" | "shot-stats">("overview");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const renderOverlayRef = useRef<() => void>(() => {});
  const tlRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<number | null>(null);
  const shotLogRef = useRef<HTMLDivElement | null>(null);
  const activeRowRef = useRef<HTMLDivElement | null>(null);

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

  // Keep renderOverlayRef fresh
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
          const playerColors = ["#89c2d9", "#2c7da0"];
          entry.players.forEach((player, pi) => {
            const color = playerColors[pi % 2];
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
          ctx.shadowColor = "#89c2d9";
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
      videoRef.current!.currentTime = p * duration;
      setCurrentTime(p * duration);
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
    if (!analysisData) return 30;
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

  // Index of the shot that was most recently hit at currentTime
  const currentShotIdx = useMemo(() => {
    if (!shotEvents.length || fps === 0) return -1;
    const currentFrame = Math.round(currentTime * fps);
    let idx = -1;
    for (let i = 0; i < shotEvents.length; i++) {
      if (shotEvents[i].frame <= currentFrame) idx = i;
      else break;
    }
    return idx;
  }, [shotEvents, currentTime, fps]);

  // Auto-scroll shot log to the active row
  useEffect(() => {
    if (currentShotIdx >= 0 && activeRowRef.current && shotLogRef.current) {
      activeRowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentShotIdx]);

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
                <div className="dark:bg-card bg-white border border-border rounded-xl flex flex-col overflow-hidden">
                  <div className="py-2.5 px-4 border-b border-border flex items-center justify-between shrink-0">
                    <span className="text-[10px] font-bold tracking-[1.2px] uppercase text-slate-500 dark:text-slate-400">
                      Shot Log
                    </span>
                    <span className="text-[11px] text-primary font-bold">
                      {shotEvents.length}
                    </span>
                  </div>
                  <div
                    ref={shotLogRef}
                    className="overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-primary/20 [&::-webkit-scrollbar-thumb]:rounded-full"
                  >
                    {shotEvents.length > 0 ? (
                      shotEvents.map((ev, i) => {
                        const isActive = i === currentShotIdx;
                        const color = shotColor(ev.type);
                        return (
                          <div
                            key={i}
                            ref={isActive ? activeRowRef : null}
                            className={`flex items-center gap-2 py-2 px-3 border-b border-border/40 cursor-pointer transition-colors ${
                              isActive
                                ? "bg-primary/10 border-l-2 border-l-primary"
                                : "hover:bg-primary/5"
                            }`}
                            onClick={() => {
                              if (videoRef.current)
                                videoRef.current.currentTime = ev.frame / fps;
                            }}
                          >
                            <span
                              className={`text-[11px] font-bold w-8 shrink-0 tabular-nums ${isActive ? "text-primary" : "text-slate-500 dark:text-slate-400"}`}
                            >
                              {fmtTime(ev.frame / fps)}
                            </span>
                            <div
                              className="w-1.5 h-1.5 rounded-full shrink-0 transition-transform"
                              style={{
                                background: color,
                                boxShadow: isActive ? `0 0 6px ${color}` : "none",
                                transform: isActive ? "scale(1.4)" : "scale(1)",
                              }}
                            />
                            <span
                              className={`text-[12px] font-semibold flex-1 truncate ${isActive ? "text-foreground" : "text-slate-500 dark:text-slate-400"}`}
                              style={isActive ? { color } : undefined}
                            >
                              {ev.type}
                            </span>
                            {ev.location_m && (
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 tabular-nums">
                                {ev.location_m[0].toFixed(1)},{ev.location_m[1].toFixed(1)}
                              </span>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex items-center justify-center p-8 text-[12px] text-slate-400 dark:text-slate-500">
                        {status === "done" ? "No shots detected" : "Processing…"}
                      </div>
                    )}
                  </div>
                </div>

                {/* Video player */}
                <div className="dark:bg-card bg-white border border-border rounded-xl overflow-hidden flex flex-col">
                  <div className="relative w-full flex-1 min-h-0 bg-[#04080d] flex items-center justify-center cursor-pointer group overflow-hidden">
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
                  <div className="p-4 px-5 pb-5 border-t border-border shrink-0">
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
                        const evPct = duration > 0 ? (ev.frame / fps / duration) * 100 : 0;
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

                {/* Live rally map */}
                <LiveTracker analysisData={analysisData} currentTime={currentTime} />
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
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
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
                          className="flex items-center gap-4 px-5 py-3 border-b border-border/40 cursor-pointer hover:bg-primary/5 transition-colors"
                          style={isLong ? { borderLeft: "2px solid rgba(245,158,11,0.4)" } : {}}
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
                              style={{ background: "rgba(255,255,255,0.06)" }}
                            >
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${(rally.length / Math.max(...rallies.map((r) => r.length))) * 100}%`,
                                  background: isLong
                                    ? "linear-gradient(90deg,#f59e0b,#d97706)"
                                    : "linear-gradient(90deg,#3B82F6,#0891b2)",
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
