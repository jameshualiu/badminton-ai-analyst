// src/pages/AnalysisPage.tsx
import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../lib/firebase"; 
import { useAuthUser } from "../auth/hooks/useAuthUser"; 
import { ShotHeatmap } from "../features/analysis/components/ShotHeatmap";
import type { AnalysisData } from "../features/analysis/types";

type VideoStatus = "uploading" | "queued" | "running" | "done" | "failed";

// Matches your new Lean Firestore structure
type FirestoreVideoDoc = {
  title?: string;
  status?: VideoStatus;
  progress?: { stage?: string; pct?: number };
  error?: string | null;
  duration?: number | null;
  totalShots?: number | null;
  analysisJson?: string | null;
  updatedAt?: any;
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
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);

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
          
          // Fetch the actual JSON telemetry if available
          if (data.urls.analysisJson) {
              fetch(data.urls.analysisJson)
                  .then(r => r.json())
                  .then(json => setAnalysisData(json))
                  .catch(e => console.error("Failed to fetch analysis JSON:", e));
          }
        }
      } catch (e: unknown) {
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
              <div className="h-[500px]">
                {analysisData ? (
                  <ShotHeatmap shots={analysisData.events} />
                ) : (
                  <div className="h-full bg-card/30 border border-white/10 rounded-xl p-4 flex flex-col items-center justify-center text-muted-foreground">
                    <h3 className="text-lg font-semibold mb-4 text-center">Shot Heatmap</h3>
                    {status === 'done' ? 'No heatmap data available.' : 'Processing...'}
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
                   <StatRow label="Duration" value={docData.duration ? `${Math.round(docData.duration)}s` : "-"} />
                   <StatRow label="Total Shots" value={docData.totalShots || "-"} />
                   <StatRow label="Processing" value={status === 'done' ? "Complete" : "In Progress"} />
                </div>
              </div>

              {/* JSON Summary Block */}
              {urls.analysisJson && (
                <div className="bg-card/30 border border-white/10 rounded-xl p-6">
                  <h3 className="text-lg font-semibold mb-4">AI Insight</h3>
                  <SummaryBlock url={urls.analysisJson} />
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
        // Parse the lean analysis.json summary
        if (data.summary) {
            const s = data.summary;
            let text = `Match Duration: ${Math.round(s.durationSec)}s\n`;
            text += `Total Shots: ${s.totalShots}\n\n`;
            text += `Shot Breakdown:\n`;
            if (s.shotCounts) {
                Object.entries(s.shotCounts).forEach(([type, count]) => {
                    text += `• ${type}: ${count}\n`;
                });
            }
            setContent(text);
        } else {
            setContent(JSON.stringify(data, null, 2));
        }
      })
      .catch(() => setContent("Could not load summary."));
  }, [url]);

  return (
    <div className="bg-black/20 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono text-muted-foreground max-h-60 overflow-y-auto">
      {content}
    </div>
  );
}