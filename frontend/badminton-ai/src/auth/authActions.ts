import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type UserCredential,
} from "firebase/auth";

import { auth } from "../lib/firebase";
import { err, ok, type Result } from "../lib/result";
import { mapFirebaseAuthError, type AuthError } from "./authErrors";

export async function signUpWithEmail(
  email: string,
  password: string
): Promise<Result<UserCredential, AuthError>> {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return ok(cred);
  } catch (e) {
    return err(mapFirebaseAuthError(e));
  }
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<Result<UserCredential, AuthError>> {
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return ok(cred);
  } catch (e) {
    return err(mapFirebaseAuthError(e));
  }
}

export async function signInWithGoogle(): Promise<Result<UserCredential, AuthError>> {
  try {
    const provider = new GoogleAuthProvider();
    const cred = await signInWithPopup(auth, provider);
    return ok(cred);
  } catch (e) {
    return err(mapFirebaseAuthError(e));
  }
}

export async function logout(): Promise<Result<void, AuthError>> {
  try {
    await signOut(auth);
    return ok(undefined);
  } catch (e) {
    return err(mapFirebaseAuthError(e));
  }
}

export async function resetPassword(email: string): Promise<Result<void, AuthError>> {
  try {
    await sendPasswordResetEmail(auth, email);
    return ok(undefined);
  } catch (e) {
    return err(mapFirebaseAuthError(e));
  }
}