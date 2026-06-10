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
  thumbnailUrl?: string | null;
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


function ThumbnailFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#0f2942] via-[#071828] to-[#07101A]">
      <div className="w-10 h-10 rounded-full border border-blue-500/30 flex items-center justify-center">
        <div className="w-0 h-0 border-t-[6px] border-b-[6px] border-l-[10px] border-t-transparent border-b-transparent border-l-blue-500/50 ml-0.5" />
      </div>
    </div>
  );
}

function VideoThumbnail({ url, title }: { url: string; title: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <ThumbnailFallback />;
  return (
    <>
      <img
        src={url}
        alt={title}
        className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-all duration-500"
        onError={() => setBroken(true)}
      />
      <div className="absolute inset-0 bg-blue-500/[0.18]" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#07101A] via-[#07101A]/30 to-transparent" />
    </>
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
        setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as RawVideoDoc[]);
        setLoading(false);
      },
      (err) => { console.error(err); setLoading(false); },
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

  const statusCounts = useMemo(() => ({
    done: docs.filter(d => d.status === "done").length,
    running: docs.filter(d => d.status === "running").length,
    queued: docs.filter(d => !d.status || d.status === "queued").length,
  }), [docs]);

  const handleUpload = async (file: File): Promise<Result<{ videoId: string }, ApiError>> => {
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
    status === "done" ? "#2563EB" : status === "failed" ? "rgba(200,80,80,0.65)" : "rgba(37,99,235,0.25)";

  const statusLabel = (s: VideoStatus | undefined) =>
    s === "done" ? "Done" : s === "failed" ? "Failed" : s === "running" ? "Processing" : "Queued";

  const statusBadgeClass = (s: VideoStatus | undefined) => {
    if (s === "done") return "bg-primary/10 text-primary";
    if (s === "failed") return "bg-red-500/10 text-red-400/80";
    return "bg-foreground/6 text-muted-foreground";
  };

  return (
    <main className="flex flex-1 flex-col gap-6 min-w-0 p-8 max-w-[1500px] mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[24px] font-semibold tracking-[-0.6px]">Your analyses</div>
          <div className="mt-0.5 text-[14px] font-light text-slate-500 dark:text-slate-400">
            Upload a match clip to get started
          </div>
        </div>
        <button
          className="flex cursor-pointer items-center gap-2 rounded-xl border-none bg-primary px-4 py-2.5 text-[14px] font-semibold text-primary-foreground transition-all hover:opacity-90 hover:scale-[1.02]"
          onClick={() => setUploadOpen(true)}
        >
          <svg width="12" height="12" viewBox="0 0 11 11" fill="none">
            <path d="M5.5 1v7M3 3.5l2.5-2.5L8 3.5M1 9.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Upload video
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {/* First card: enhanced with status breakdown */}
        <div className="rounded-2xl border border-slate-200 dark:border-border bg-white dark:bg-card p-4">
          <div className="mb-1.5 text-[10px] font-bold tracking-[1.2px] uppercase text-slate-400 dark:text-slate-500">
            Analyses
          </div>
          <div className="text-[28px] font-bold tracking-[-0.8px] leading-tight">
            <span className="text-primary">{stats.total}</span>
          </div>
          <div className="mt-1 mb-3 text-[11px] text-slate-500 dark:text-slate-400 font-medium">total sessions</div>
          {stats.total > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {statusCounts.done > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                  {statusCounts.done} Done
                </span>
              )}
              {statusCounts.running > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">
                  {statusCounts.running} Processing
                </span>
              )}
              {statusCounts.queued > 0 && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400">
                  {statusCounts.queued} Queued
                </span>
              )}
            </div>
          )}
        </div>
        {/* Remaining stat cards */}
        {[
          { label: "Shots tracked", val: stats.shots, sub: "all clips" },
          { label: "Minutes analysed", val: stats.minutes, unit: "m", sub: "of footage" },
          { label: "Avg shots", val: stats.avgShots, unit: "/clip", sub: "per analysis" },
        ].map((s, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 dark:border-border bg-white dark:bg-card p-4">
            <div className="mb-1.5 text-[10px] font-bold tracking-[1.2px] uppercase text-slate-400 dark:text-slate-500">
              {s.label}
            </div>
            <div className="text-[28px] font-bold tracking-[-0.8px] leading-tight">
              {s.val}
              {s.unit && (
                <span className="ml-0.5 text-[14px] text-slate-400 dark:text-slate-500 font-normal">{s.unit}</span>
              )}
            </div>
            <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Main content: analyses left, activity feed right */}
      <div className={`grid gap-6 items-start ${docs.length > 0 ? "grid-cols-[1fr_280px]" : "grid-cols-1"}`}>
        {/* Left: Recent Analyses */}
        <div>
          <div className="mb-3 px-1 text-[10px] font-bold tracking-[1.4px] uppercase text-slate-400 dark:text-slate-500">
            Recent Analyses
          </div>
          {loading ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-border bg-slate-50 dark:bg-white/5 p-12 text-center text-[14px] text-slate-500 dark:text-slate-400">
              Loading your library…
            </div>
          ) : docs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 dark:border-border bg-slate-50 dark:bg-white/5 p-12 text-center text-[14px] text-slate-500 dark:text-slate-400">
              No analyses yet — upload a match clip to get started.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className="group cursor-pointer overflow-hidden rounded-xl border border-slate-200 dark:border-border bg-white dark:bg-card transition-all hover:border-primary/40 hover:shadow-md hover:shadow-slate-200/80 dark:hover:shadow-black/40"
                  onClick={() => navigate(`/analysis/${doc.id}`)}
                >
                  <div className="relative flex aspect-video w-full overflow-hidden">
                    {doc.thumbnailUrl ? (
                      <VideoThumbnail url={doc.thumbnailUrl} title={doc.title ?? ""} />
                    ) : (
                      <ThumbnailFallback />
                    )}
                    <span className={`absolute top-2 right-2 rounded-lg px-2 py-0.5 text-[9px] font-bold tracking-[0.4px] uppercase shadow-sm ${statusBadgeClass(doc.status)}`}>
                      {statusLabel(doc.status)}
                    </span>
                  </div>
                  <div className="p-3">
                    <div className="mb-0.5 truncate text-[13.5px] font-semibold text-foreground group-hover:text-primary transition-colors">
                      {doc.title ?? "Untitled"}
                    </div>
                    <div className="mb-2 text-[11.5px] font-light text-slate-500 dark:text-slate-400">
                      {fmtDate(doc.createdAt)}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {fmtDuration(doc.duration)}
                      </span>
                      {doc.totalShots ? (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
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
                <div className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 dark:border-border group-hover:border-primary/40 text-lg font-light text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors">
                  +
                </div>
                <div className="text-[12px] font-medium text-slate-400 dark:text-slate-500 group-hover:text-primary transition-colors">
                  New analysis
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Activity feed */}
        {docs.length > 0 && (
          <div>
            <div className="mb-3 px-1 text-[10px] font-bold tracking-[1.4px] uppercase text-slate-400 dark:text-slate-500">
              Recent Activity
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-border bg-white dark:bg-card">
              {docs.slice(0, 10).map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 border-b border-slate-100 dark:border-border/50 px-4 py-3 transition-colors last:border-b-0 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer group"
                  onClick={() => navigate(`/analysis/${doc.id}`)}
                >
                  <div
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: dotColor(doc.status), boxShadow: `0 0 6px ${dotColor(doc.status)}` }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {doc.title ?? "Untitled"}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                      {timeAgo(doc.createdAt)}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-lg px-1.5 py-0.5 text-[9px] font-bold uppercase ${statusBadgeClass(doc.status)}`}>
                    {statusLabel(doc.status)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

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
