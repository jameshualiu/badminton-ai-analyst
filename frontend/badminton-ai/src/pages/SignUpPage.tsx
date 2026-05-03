import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowLeft, Chrome, Lock, Mail, Sparkles, User } from "lucide-react";
import { signInWithGoogle, signUpWithEmail } from "../auth/authActions";
import { useAuthUser } from "../auth/hooks/useAuthUser";

export default function SignUpPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuthUser();

  const [name, setName] = useState(""); // optional for now
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading, navigate]);

  if (authLoading || user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setError(null);
    setLoading(true);

    const res = await signUpWithEmail(email, password);

    setLoading(false);

    if (!res.ok) {
      setError(res.error.message);
      return;
    }

    // TODO later: store `name` in Firestore under the user's uid
    navigate("/dashboard");
  };

  const handleGoogleSignUp = async () => {
    setError(null);
    setLoading(true);

    const res = await signInWithGoogle();

    setLoading(false);

    if (!res.ok) {
      setError(res.error.message);
      return;
    }

    // TODO later: store `name` if you collect it after Google sign-in
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center overflow-hidden relative">
      {/* Background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-1/4 right-1/4 w-[600px] h-[600px] rounded-full bg-glow/25 blur-[110px] mix-blend-screen transform-gpu will-change-transform"
          animate={{ scale: [1, 1.2, 1], opacity: [0.25, 0.45, 0.25] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-glow-2/20 blur-[100px] mix-blend-screen transform-gpu will-change-transform"
          animate={{ scale: [1, 1.15, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* Back */}
      <motion.button
        onClick={() => navigate("/")}
        className="absolute top-8 left-8 flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors z-10"
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.6 }}
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back</span>
      </motion.button>

      {/* Container */}
      <motion.div
        className="relative z-10 w-full max-w-md mx-4"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        {/* Header */}
        <div className="text-center mb-10">
          <motion.div
            className="inline-flex p-4 bg-gradient-to-br from-primary to-accent rounded-2xl shadow-2xl shadow-primary/35 mb-6"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Sparkles className="w-8 h-8" />
          </motion.div>

          <motion.h1
            className="text-4xl mb-3 bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-transparent"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            Create Account
          </motion.h1>

          <motion.p
            className="text-muted-foreground"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            Start your journey to better performance
          </motion.p>
        </div>

        {/* Card */}
        <motion.div
          className="bg-gradient-to-br from-card/70 to-background/40 backdrop-blur-xl border border-border/50 rounded-3xl p-8 shadow-2xl shadow-primary/15 relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />

          <form onSubmit={handleEmailSignUp} className="space-y-5 relative">
            {/* Error */}
            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {/* Name */}
            <div>
              <label className="block text-sm text-muted-foreground mb-2">Full Name</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/60" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full pl-12 pr-4 py-4 bg-background/30 border border-border/60 rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm text-muted-foreground mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/60" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full pl-12 pr-4 py-4 bg-background/30 border border-border/60 rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm text-muted-foreground mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/60" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-4 py-4 bg-background/30 border border-border/60 rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-sm text-muted-foreground mb-2">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground/60" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-4 py-4 bg-background/30 border border-border/60 rounded-xl text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 transition-all"
                  required
                  disabled={loading}
                />
              </div>
            </div>

            {/* Create account */}
            <motion.button
              type="submit"
              disabled={loading}
              className="group w-full py-4 bg-gradient-to-br from-primary via-primary to-accent rounded-xl cursor-pointer font-medium text-primary-foreground transition-all relative overflow-hidden disabled:opacity-60 disabled:cursor-not-allowed"
              whileHover={{ scale: loading ? 1 : 1.02 }}
              whileTap={{ scale: loading ? 1 : 0.98 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="relative text-lg font-semibold">
                {loading ? "Creating..." : "Create Account"}
              </span>
            </motion.button>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/40" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-transparent text-muted-foreground">
                  Or continue with
                </span>
              </div>
            </div>

            {/* Google */}
            <button
              type="button"
              onClick={handleGoogleSignUp}
              disabled={loading}
              className="group w-full py-4 bg-card/40 backdrop-blur-sm border border-border/60 hover:bg-card/60 hover:border-primary/50 rounded-xl transition-all flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Chrome className="w-5 h-5" />
              <span className="cursor-pointer">{loading ? "Please wait..." : "Continue with Google"}</span>
            </button>

            {/* Sign in link */}
            <p className="text-center mt-6 text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/signin")}
                className="text-primary cursor-pointer hover:opacity-80 transition"
              >
                Sign in
              </button>
            </p>
          </form>
        </motion.div>
      </motion.div>
    </div>
  );
}