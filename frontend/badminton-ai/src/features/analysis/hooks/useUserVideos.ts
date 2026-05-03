import { Timestamp, collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";
import type { VideoStatus } from "../types";

type VideoDoc = {
  id: string;
  title?: string;
  createdAt?: Timestamp;
  duration?: number | null;
  totalShots?: number | null;
  status?: VideoStatus;
};

export function useUserVideos(uid?: string) {
  const [videos, setVideos] = useState<VideoDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) return;

    const q = query(collection(db, "users", uid, "videos"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setVideos(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as VideoDoc[]);
      setLoading(false);
    });

    return () => unsub();
  }, [uid]);

  return { videos: uid ? videos : [], loading: uid ? loading : false };
}