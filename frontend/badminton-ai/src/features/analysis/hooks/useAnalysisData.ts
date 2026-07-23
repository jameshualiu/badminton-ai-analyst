import { Timestamp, doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { useAuthUser } from "../../../auth/hooks/useAuthUser";
import type { AnalysisData, VideoStatus } from "../types";

export type FirestoreVideoDoc = {
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

export function useAnalysisData(videoId: string | undefined) {
  const { user } = useAuthUser();

  const [docData, setDocData] = useState<FirestoreVideoDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [urls, setUrls] = useState<Partial<Record<string, string>>>({});
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);

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

  return { docData, loading, urls, analysisData, status };
}
