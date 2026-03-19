import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "./firebase";

export async function ensureUserDoc(user: User) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  const base = {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    photoURL: user.photoURL ?? null,
    updatedAt: serverTimestamp(),
  };

  if (!snap.exists()) {
    await setDoc(ref, {
      ...base,
      plan: "free",
      createdAt: serverTimestamp(),
    });
  } else {
    await updateDoc(ref, base);
  }
}