import { Timestamp, doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import { useAuthUser } from "../../../auth/hooks/useAuthUser";
import type { CancelState } from "../../../utils/retry";
import { withRetry } from "../../../utils/retry";
import { getVideoResults } from "../videoService";
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

export function useAnalysisData(videoId: string | undefined) {
  const { user } = useAuthUser();

  const [docData, setDocData] = useState<FirestoreVideoDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [urls, setUrls] = useState<Partial<Record<string, string>>>({});
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [resultsError, setResultsError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);

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
    const cancelState: CancelState = { cancelled: false };
    (async () => {
      setResultsError(false);
      try {
        const token = await user.getIdToken();
        const data = await withRetry(
          () => getVideoResults(videoId, token),
          cancelState,
        );
        if (cancelState.cancelled) return;
        if (data.urls) {
          setUrls(data.urls);
          if (data.urls.analysisJson) {
            const analysisUrl = data.urls.analysisJson;
            const json = await withRetry(async () => {
              const jr = await fetch(analysisUrl);
              if (!jr.ok) throw new Error("Failed to fetch analysis JSON");
              return jr.json();
            }, cancelState);
            if (!cancelState.cancelled) setAnalysisData(json);
          }
        }
      } catch (e) {
        console.error(e);
        if (!cancelState.cancelled) setResultsError(true);
      }
    })();
    return () => {
      cancelState.cancelled = true;
    };
  }, [user, videoId, status, retryNonce]);

  const retryAnalysisData = () => setRetryNonce((n) => n + 1);

  return { docData, loading, urls, analysisData, status, resultsError, retryAnalysisData };
}
