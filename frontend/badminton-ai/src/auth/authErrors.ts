export type AuthErrorCode =
  | "invalid-email"
  | "user-disabled"
  | "user-not-found"
  | "wrong-password"
  | "invalid-credential"
  | "email-already-in-use"
  | "weak-password"
  | "popup-closed-by-user"
  | "network-request-failed"
  | "too-many-requests"
  | "unknown";

export type AuthError = {
  code: AuthErrorCode;
  message: string; // user-friendly
  rawCode?: string; // original firebase code if you want
};

function getCode(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e && typeof (e as Record<string, unknown>).code === "string") {
    return (e as Record<string, unknown>).code as string;
  }
  return undefined;
}

function getMessage(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "message" in e && typeof (e as Record<string, unknown>).message === "string") {
    return (e as Record<string, unknown>).message as string;
  }
  return undefined;
}

export function mapFirebaseAuthError(e: unknown): AuthError {
  const rawCode = getCode(e);

  const codePart = rawCode?.startsWith("auth/") ? rawCode.slice(5) : undefined;

  switch (codePart) {
    case "invalid-email":
      return { code: "invalid-email", message: "That email address isn’t valid.", rawCode };
    case "user-disabled":
      return { code: "user-disabled", message: "This account has been disabled.", rawCode };
    case "user-not-found":
      return { code: "user-not-found", message: "No account found with that email.", rawCode };
    case "wrong-password":
      return { code: "wrong-password", message: "Incorrect password.", rawCode };
    case "invalid-credential":
      return { code: "invalid-credential", message: "Email or password is incorrect.", rawCode };
    case "email-already-in-use":
      return { code: "email-already-in-use", message: "An account with that email already exists.", rawCode };
    case "weak-password":
      return { code: "weak-password", message: "Password is too weak (try 8+ characters).", rawCode };
    case "popup-closed-by-user":
      return { code: "popup-closed-by-user", message: "Google sign-in was cancelled.", rawCode };
    case "network-request-failed":
      return { code: "network-request-failed", message: "Network error. Check your connection and try again.", rawCode };
    case "too-many-requests":
      return { code: "too-many-requests", message: "Too many attempts. Please wait a bit and try again.", rawCode };
    default:
      return {
        code: "unknown",
        message: getMessage(e) ?? "Something went wrong. Please try again.",
        rawCode,
      };
  }
}