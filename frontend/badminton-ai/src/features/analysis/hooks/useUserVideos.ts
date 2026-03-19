import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../../lib/firebase";

export function useUserVideos(uid?: string) {
  const [videos, setVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setVideos([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, "users", uid, "videos"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setVideos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });

    return () => unsub();
  }, [uid]);

  return { videos, loading };
}