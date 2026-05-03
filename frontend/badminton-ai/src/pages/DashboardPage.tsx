import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  Timestamp,
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { UploadModal } from "../features/analysis/components/UploadModal";
import { useAuthUser } from "../auth/hooks/useAuthUser";
import {
  createAndUploadVideo,
  deleteVideo,
  type Result,
  ApiError,
} from "../features/analysis/videoService";
import { db } from "../lib/firebase";
import type { VideoStatus } from "../features/analysis/types";

type RawVideoDoc = {
  id: string;
  title?: string;
  createdAt?: Timestamp;
  duration?: number | null;
  totalShots?: number | null;
  status?: VideoStatus;
};

function fmtDuration(sec: number | null | undefined): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60),
    s = Math.round(sec % 60);
  return `${m}m ${String(s).padStart(2, "0")}s`;
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

function timeAgo(ts: Timestamp | undefined): string {
  if (!ts?.toDate) return "";
  const diff = Date.now() - ts.toDate().getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return "just now";
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}

// Mini court SVG lines for card thumbnails
function MiniCourt() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 160 90"
      preserveAspectRatio="xMidYMid meet"
      className="absolute inset-0 opacity-80"
    >
      <rect
        x="6"
        y="5"
        width="148"
        height="80"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.6"
        className="text-primary/20"
      />
      <line
        x1="6"
        y1="45"
        x2="154"
        y2="45"
        stroke="currentColor"
        strokeWidth="0.9"
        className="text-primary/40"
      />
      <line
        x1="6"
        y1="22"
        x2="154"
        y2="22"
        stroke="currentColor"
        strokeWidth="0.5"
        className="text-primary/12"
      />
      <line
        x1="6"
        y1="68"
        x2="154"
        y2="68"
        stroke="currentColor"
        strokeWidth="0.5"
        className="text-primary/12"
      />
      <line
        x1="80"
        y1="5"
        x2="80"
        y2="22"
        stroke="currentColor"
        strokeWidth="0.5"
        className="text-primary/12"
      />
      <line
        x1="80"
        y1="68"
        x2="80"
        y2="85"
        stroke="currentColor"
        strokeWidth="0.5"
        className="text-primary/12"
      />
    </svg>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { uploadTrigger } = useOutletContext<{ uploadTrigger: number }>();
  const [uploadOpen, setUploadOpen] = useState(false);
  const { user } = useAuthUser();
  const [rawDocs, setDocs] = useState<RawVideoDoc[]>([]);
  const [rawLoading, setLoading] = useState(true);
  const docs = useMemo(() => (user ? rawDocs : []), [user, rawDocs]);
  const loading = user ? rawLoading : false;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (uploadTrigger > 0) setUploadOpen(true);
  }, [uploadTrigger]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, "users", user.uid, "videos"),
      orderBy("createdAt", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setDocs(
          snap.docs.map((d) => ({ id: d.id, ...d.data() })) as RawVideoDoc[],
        );
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      },
    );
    return () => unsub();
  }, [user]);

  const stats = useMemo(() => {
    const total = docs.length;
    const shots = docs.reduce((s, d) => s + (d.totalShots ?? 0), 0);
    const minutes = docs.reduce((s, d) => s + (d.duration ?? 0), 0) / 60;
    const done = docs.filter((d) => d.status === "done");
    const avgShots = done.length > 0 ? Math.round(shots / done.length) : 0;
    return { total, shots, minutes: Math.round(minutes), avgShots };
  }, [docs]);

  const handleUpload = async (
    file: File,
  ): Promise<Result<{ videoId: string }, ApiError>> => {
    if (!user) return { ok: false, error: new ApiError("Not signed in", 401) };
    const token = await user.getIdToken();
    return createAndUploadVideo(file, token);
  };

  const handleDelete = async (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    if (!window.confirm("Delete this analysis? This cannot be undone.")) return;
    try {
      const token = await user.getIdToken();
      await deleteVideo(videoId, token);
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete. Please try again.");
    }
  };

  const dotColor = (status: VideoStatus | undefined) =>
    status === "done"
      ? "#89c2d9"
      : status === "failed"
        ? "rgba(200,80,80,0.65)"
        : "rgba(169,214,229,0.35)";

  const statusLabel = (s: VideoStatus | undefined) =>
    s === "done"
      ? "Done"
      : s === "failed"
        ? "Failed"
        : s === "running"
          ? "Processing"
          : "Queued";

  const statusBadgeClass = (s: VideoStatus | undefined) => {
    if (s === "done") return "bg-primary/13 text-primary";
    if (s === "failed") return "bg-red-500/10 text-red-400/80";
    return "bg-foreground/6 text-muted";
  };

  return (
    <main className="flex flex-1 flex-col gap-6 min-w-0 p-8 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[24px] font-semibold tracking-[-0.6px]">
            Your analyses
          </div>
          <div className="mt-0.5 text-[14px] font-light text-muted">
            Upload a match clip to get started
          </div>
        </div>
        <button
          className="flex cursor-pointer items-center gap-2 rounded-xl border-none bg-primary px-4 py-2.5 text-[14px] font-semibold text-primary-foreground transition-all hover:opacity-90 hover:scale-[1.02]"
          onClick={() => setUploadOpen(true)}
        >
          <svg width="12" height="12" viewBox="0 0 11 11" fill="none">
            <path
              d="M5.5 1v7M3 3.5l2.5-2.5L8 3.5M1 9.5h9"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Upload video
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          {
            label: "Analyses",
            val: stats.total,
            sub: "total sessions",
            color: true,
          },
          { label: "Shots tracked", val: stats.shots, sub: "all clips" },
          {
            label: "Minutes analysed",
            val: stats.minutes,
            unit: "m",
            sub: "of footage",
          },
          {
            label: "Avg shots",
            val: stats.avgShots,
            unit: "/clip",
            sub: "per analysis",
          },
        ].map((s, i) => (
          <div
            key={i}
            className="rounded-2xl border border-border bg-surface/50 p-4"
          >
            <div className="mb-1.5 text-[10px] font-bold tracking-[1.2px] uppercase text-muted">
              {s.label}
            </div>
            <div className="text-[28px] font-bold tracking-[-0.8px] leading-tight">
              {s.color ? <span className="text-primary">{s.val}</span> : s.val}
              {s.unit && (
                <span className="ml-0.5 text-[14px] text-muted font-normal">
                  {s.unit}
                </span>
              )}
            </div>
            <div className="mt-1 text-[11px] text-primary/60 font-medium">
              {s.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Recent */}
      <div>
        <div className="mb-3 px-1 text-[10px] font-bold tracking-[1.4px] uppercase text-foreground/30">
          Recent Analyses
        </div>
        {loading ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface/20 p-12 text-center text-[14px] text-muted">
            Loading your library…
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface/20 p-12 text-center text-[14px] text-muted">
            No analyses yet — upload a match clip to get started.
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="group cursor-pointer overflow-hidden rounded-xl border border-border bg-surface/40 transition-all hover:border-primary/40 hover:bg-surface/60 hover:shadow-xl hover:shadow-primary/5"
                onClick={() => navigate(`/analysis/${doc.id}`)}
              >
                <div className="relative flex aspect-video w-full items-center justify-center bg-[#04080d]">
                  {doc.status === "done" && <MiniCourt />}
                  <span
                    className={`absolute top-2 right-2 rounded-lg px-2 py-0.5 text-[9px] font-bold tracking-[0.4px] uppercase shadow-sm ${statusBadgeClass(doc.status)}`}
                  >
                    {statusLabel(doc.status)}
                  </span>
                </div>
                <div className="p-3">
                  <div className="mb-0.5 truncate text-[13.5px] font-semibold text-foreground group-hover:text-primary transition-colors">
                    {doc.title ?? "Untitled"}
                  </div>
                  <div className="mb-2 text-[11.5px] font-light text-muted">
                    {fmtDate(doc.createdAt)}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] text-muted flex items-center gap-1">
                      <svg
                        className="w-2.5 h-2.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      {fmtDuration(doc.duration)}
                    </span>
                    {doc.totalShots ? (
                      <span className="text-[11px] text-muted flex items-center gap-1">
                        <svg
                          className="w-2.5 h-2.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"
                          />
                        </svg>
                        {doc.totalShots} shots
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="flex items-center gap-1.5 cursor-pointer rounded-lg border border-red-500/20 bg-red-500/5 px-2 py-1 text-[10px] font-medium text-red-400 transition-all hover:bg-red-500/20 hover:border-red-500/40"
                      onClick={(e) => handleDelete(doc.id, e)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <div
              className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-transparent transition-all hover:border-primary/40 hover:bg-primary/5 group"
              onClick={() => setUploadOpen(true)}
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border group-hover:border-primary/40 text-lg font-light text-muted group-hover:text-primary transition-colors">
                +
              </div>
              <div className="text-[12px] font-medium text-muted group-hover:text-primary transition-colors">
                New analysis
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Activity */}
      {docs.length > 0 && (
        <div className="max-w-[800px]">
          <div className="mb-3 px-1 text-[10px] font-bold tracking-[1.4px] uppercase text-foreground/30">
            Recent Activity
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface/30">
            {docs.slice(0, 5).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-4 border-b border-border/40 px-5 py-3.5 transition-colors last:border-b-0 hover:bg-primary/5 group"
              >
                <div
                  className="h-1.5 w-1.5 shrink-0 rounded-full shadow-[0_0_8px_currentColor]"
                  style={{
                    background: dotColor(doc.status),
                    color: dotColor(doc.status),
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-medium text-foreground">
                    {doc.title ?? "Untitled"}
                    <span className="font-light text-muted ml-2">
                      ·{" "}
                      {doc.status === "done"
                        ? "Analysis complete"
                        : doc.status === "running"
                          ? "Processing started"
                          : doc.status === "failed"
                            ? "Analysis failed"
                            : "Queued"}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted/60">
                    {timeAgo(doc.createdAt)}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(doc.status)}`}
                >
                  {statusLabel(doc.status)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <UploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        userId={user?.uid ?? ""}
        onUpload={handleUpload}
        onSeeAnalysis={(id) => navigate(`/analysis/${id}`)}
      />
    </main>
  );
}
