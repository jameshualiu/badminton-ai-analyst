// src/pages/AnalysisPage.tsx
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../lib/firebase"; // Still needed for READ-ONLY status updates
import { useAuthUser } from "../auth/hooks/useAuthUser"; // Your auth hook

type VideoStatus = "uploading" | "queued" | "running" | "done" | "failed";

// Matches your Firestore structure
type FirestoreVideoDoc = {
  title?: string;
  status?: VideoStatus;
  progress?: { stage?: string; pct?: number };
  error?: string | null;
  
  // "artifacts" in DB just stores the R2 keys (e.g. "analyses/xyz/heatmap.png")
  // We need the API to turn these into signed URLs.
  artifacts?: {
    heatmapImage?: string | null;
    summary?: string | null;
    annotatedVideo?: string | null;
  };

  summary?: {
    durationSec?: number | null;
    totalShots?: number | null;
    shotCounts?: Record<string, number>;
    trackingQuality?: { ballVisiblePct?: number | null };
  };
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000/api/v1";

export default function AnalysisPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthUser();

  const [docData, setDocData] = useState<FirestoreVideoDoc | null>(null);
  const [loading, setLoading] = useState(true);

  // These are the secure, signed URLs we get from the backend
  const [urls, setUrls] = useState<Partial<Record<string, string>>>({});

  // 1. Real-time Status Subscription (Firestore)
  // This is fine to keep on frontend for "Read-Only" status updates
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
        console.error("Analysis subscription error:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user, videoId]);

  // Derived state for UI
  const status = (docData?.status as VideoStatus) ?? "queued";
  const statusLine = useMemo(() => {
    if (loading) return "Loading...";
    if (!docData) return "Video not found.";
    if (status === "uploading") return "Uploading...";
    if (status === "queued") return "Queued for analysis...";
    if (status === "running") return `Analyzing... ${docData.progress?.pct ? `(${docData.progress.pct}%)` : ""}`;
    if (status === "failed") return `Analysis failed: ${docData.error || "Unknown error"}`;
    return "Analysis complete.";
  }, [loading, docData, status]);

  // 2. Fetch Signed URLs from Backend
  // Only runs when status is "done" (or "running" if you support partial results)
  useEffect(() => {
    if (!user || !videoId || !docData) return;
    if (status !== "done" && status !== "running") return;

    let cancelled = false;

    async function fetchSignedUrls() {
      try {
        // A. Get the secure token
        const token = await user?.getIdToken();

        // B. Call backend
        const res = await fetch(`${API_BASE}/videos/${videoId}/results`, {
          headers: {
             "Authorization": `Bearer ${token}`
          }
        });

        if (!res.ok) throw new Error("Failed to fetch results");

        const data = await res.json();
        if (!cancelled && data.urls) {
          setUrls(data.urls);
        }
      } catch (e: any) {
        console.error("Failed to fetch signed URLs:", e);
      }
    }
    fetchSignedUrls();
    return () => { cancelled = true; };
  }, [user, videoId, status]); // Re-run if status changes to "done"

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 py-6">
        
        {/* Navigation */}
        <button onClick={() => navigate("/dashboard")} className="mb-6 text-sm text-muted-foreground hover:text-white transition">
          ← Back to dashboard
        </button>

        {/* Header & Status */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">{docData?.title || "Match Analysis"}</h1>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className={`w-2.5 h-2.5 rounded-full ${status === 'done' ? 'bg-green-500' : 'bg-yellow-500'}`} />
            {statusLine}
          </div>
        </div>

        {/* Loading / Not Found States */}
        {loading && <div>Loading analysis data...</div>}
        {!loading && !docData && <div>Analysis not found.</div>}

        {/* Main Content Grid */}
        {docData && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column: Visuals */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Video Player */}
              <div className="bg-card/30 border border-white/10 rounded-xl overflow-hidden aspect-video relative flex items-center justify-center">
                {urls.annotatedVideo || urls.originalVideo ? (
                  <video 
                    src={urls.annotatedVideo || urls.originalVideo} 
                    controls 
                    className="w-full h-full object-contain" 
                  />
                ) : (
                  <div className="text-muted-foreground">Video unavailable</div>
                )}
              </div>

              {/* Heatmap */}
              <div className="bg-card/30 border border-white/10 rounded-xl p-4">
                <h3 className="text-lg font-semibold mb-4">Shot Heatmap</h3>
                {urls.heatmapImage ? (
                  <img src={urls.heatmapImage} alt="Heatmap" className="w-full rounded-lg" />
                ) : (
                   <div className="h-40 flex items-center justify-center text-muted-foreground bg-black/20 rounded-lg">
                     {status === 'done' ? 'No heatmap generated' : 'Processing...'}
                   </div>
                )}
              </div>
            </div>

            {/* Right Column: Stats & Data */}
            <div className="space-y-6">
              
              {/* Stats Card */}
              <div className="bg-card/30 border border-white/10 rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Match Stats</h3>
                <div className="space-y-3">
                   <StatRow label="Duration" value={docData.summary?.durationSec ? `${Math.round(docData.summary.durationSec)}s` : "-"} />
                   <StatRow label="Total Shots" value={docData.summary?.totalShots || "-"} />
                   <StatRow label="Tracking Quality" value={docData.summary?.trackingQuality?.ballVisiblePct ? `${Math.round(docData.summary.trackingQuality.ballVisiblePct * 100)}%` : "-"} />
                </div>
              </div>

              {/* JSON Summary Block */}
              {urls.summary && (
                <div className="bg-card/30 border border-white/10 rounded-xl p-6">
                  <h3 className="text-lg font-semibold mb-4">AI Insight</h3>
                  <SummaryBlock url={urls.summary} />
                </div>
              )}

            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Simple helper component for stats
function StatRow({ label, value }: { label: string, value: string | number }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

// Simple helper for fetching JSON content
function SummaryBlock({ url }: { url: string }) {
  const [content, setContent] = useState<string>("Loading summary...");
  
  useEffect(() => {
    fetch(url)
      .then(res => res.json())
      .then(data => {
        // Handle different JSON formats gracefully
        const text = Array.isArray(data.bullets) ? data.bullets.join("\n• ") : 
                     data.text ? data.text : 
                     JSON.stringify(data, null, 2);
        setContent(Array.isArray(data.bullets) ? "• " + text : text);
      })
      .catch(() => setContent("Could not load summary."));
  }, [url]);

  return (
    <div className="bg-black/20 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono text-muted-foreground max-h-60 overflow-y-auto">
      {content}
    </div>
  );
}