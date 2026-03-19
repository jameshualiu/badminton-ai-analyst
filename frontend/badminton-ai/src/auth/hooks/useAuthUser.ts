import { useEffect, useRef, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { ensureUserDoc } from "../../lib/ensureUserDoc";

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const ensuredRef = useRef(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setLoading(false);

      if (u && !ensuredRef.current) {
        ensuredRef.current = true;
        try { await ensureUserDoc(u); } catch (e) { console.error(e); }
      }
      if (!u) ensuredRef.current = false;
    });
    return () => unsub();
  }, []);

  return { user, loading };
}