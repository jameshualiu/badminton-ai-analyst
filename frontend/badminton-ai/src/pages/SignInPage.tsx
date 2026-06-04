import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Chrome, Lock, Mail, Sparkles } from "lucide-react";
import { signInWithEmail, signInWithGoogle } from "../auth/authActions";
import { useAuthUser } from "../auth/hooks/useAuthUser";

export default function SignInPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthUser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) navigate("/dashboard", { replace: true });
  }, [user, authLoading, navigate]);

  if (authLoading || user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signInWithEmail(email, password);
    setLoading(false);
    if (!res.ok) { setError(res.error.message); return; }
    navigate("/dashboard");
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    const res = await signInWithGoogle();
    setLoading(false);
    if (!res.ok) { setError(res.error.message); return; }
    navigate("/dashboard");
  };

  const inputClass = "w-full pl-10 pr-4 py-3 bg-white dark:bg-card border border-slate-300 dark:border-border rounded-xl text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      <header className="w-full border-b border-slate-200 dark:border-border bg-white/90 dark:bg-background/90 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto px-8 h-[70px] flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="cursor-pointer flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <div className="p-1.5 bg-primary/10 border border-primary/20 rounded-lg">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <span className="text-[17px] font-semibold tracking-tight text-foreground">Shuttleye</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">Welcome back</h1>
            <p className="text-slate-500 dark:text-slate-400">Sign in to continue your analysis</p>
          </div>

          <div className="bg-white dark:bg-card border border-slate-300 dark:border-border rounded-2xl p-8 shadow-sm">
            <form onSubmit={handleEmailSignIn} className="space-y-5">

              {error && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={inputClass}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300">Password</label>
                  <button type="button" className="cursor-pointer text-sm text-primary hover:text-primary/80 transition-colors">
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={inputClass}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="cursor-pointer w-full py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                {loading ? "Signing in…" : "Sign In"}
              </button>

              {/* Divider */}
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-border" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white dark:bg-card text-slate-400 dark:text-slate-500">or</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="cursor-pointer w-full py-3 bg-white dark:bg-card text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-border rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-white/10 hover:border-slate-400 dark:hover:border-border hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150 flex items-center justify-center gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                <Chrome className="w-4 h-4" />
                {loading ? "Please wait…" : "Continue with Google"}
              </button>

              <p className="text-center text-sm text-slate-500 dark:text-slate-400 pt-1">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  className="cursor-pointer text-primary font-medium hover:text-primary/80 transition-colors"
                  onClick={() => navigate("/signup")}
                >
                  Sign up
                </button>
              </p>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
