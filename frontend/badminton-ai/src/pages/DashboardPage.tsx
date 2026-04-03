import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Plus } from "lucide-react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

import { UploadModal } from "../features/analysis/components/UploadModal";
import { useAuthUser } from "../auth/hooks/useAuthUser";
import { createAndUploadVideo, deleteVideo } from "../features/analysis/videoService";
import { db } from "../lib/firebase";

// ✅ adjust this import to where your VideoCard file actually lives
import { VideoCard } from "../features/analysis/components/VideoCard";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [uploadOpen, setUploadOpen] = useState(false);
  const { user } = useAuthUser();

  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Listen to videos collection for this user
  useEffect(() => {
    if (!user) {
      setDocs([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, "users", user.uid, "videos"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("videos snapshot error:", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user]);

  const cards = useMemo(() => {
    return docs.map((v) => ({
      id: v.id,
      title: v.title ?? "Untitled",
      date: v.createdAt?.toDate ? v.createdAt.toDate().toISOString() : new Date().toISOString(),
      thumbnail: null, // no storage yet
      duration: v.duration ?? null,
      totalShots: v.totalShots ?? 0,
      status: v.status ?? "queued",
    }));
  }, [docs]);

  const handleUpload = async (file: File) => {
    if (!user) throw new Error("Not signed in");
    const token = await user.getIdToken();
    const { videoId } = await createAndUploadVideo(file, token);
    return { videoId };
  };

  const handleSeeAnalysis = (videoId: string) => {
    navigate(`/analysis/${videoId}`);
  };

  const handleDelete = async (videoId: string) => {
    if (!user) return;
    if (!window.confirm("Are you sure you want to delete this analysis? This cannot be undone.")) return;

    try {
      const token = await user.getIdToken();
      await deleteVideo(videoId, token);
      // No need to manually refresh, onSnapshot handles it!
    } catch (err) {
      console.error("Delete failed:", err);
      alert("Failed to delete video. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <motion.div
          className="rounded-3xl border border-border/50 bg-card/40 backdrop-blur-sm p-8"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-semibold mb-2">Your Analyses</h1>
              <p className="text-muted-foreground">
                Upload a match clip to generate your first AI analysis.
              </p>
            </div>

            <button
              onClick={() => setUploadOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/30 hover:shadow-primary/50 cursor-pointer transition"
            >
              <Plus className="w-5 h-5" />
              <span className="font-semibold">Upload video</span>
            </button>
          </div>

          {/* Cards grid */}
          <div className="mt-8">
            {loading ? (
              <div className="text-muted-foreground">Loading…</div>
            ) : cards.length === 0 ? (
              <div className="rounded-2xl border border-border/40 bg-background/30 p-6">
                <div className="font-semibold">No analyses yet</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Upload a match clip to generate your first AI analysis.
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map((c) => (
                  <VideoCard
                    key={c.id}
                    video={c}
                    onClick={() => handleSeeAnalysis(c.id)}
                    onDelete={() => handleDelete(c.id)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="mt-8 text-sm text-muted-foreground">
            Debug: if you can see this page after signing in, routing is working.
          </div>

          <div className="mt-4">
            <button
              onClick={() => navigate("/")}
              className="text-sm text-primary hover:opacity-80 transition cursor-pointer"
            >
              ← Back to landing
            </button>
          </div>
        </motion.div>
      </div>

      <UploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUpload={handleUpload}
        onSeeAnalysis={handleSeeAnalysis}
      />
    </div>
  );
}
