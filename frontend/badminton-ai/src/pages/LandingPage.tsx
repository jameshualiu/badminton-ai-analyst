import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { motion } from "motion/react";
import { Brain, ChevronRight, Play, Sparkles, TrendingUp, Zap } from "lucide-react";
import { useAuthUser } from "../auth/hooks/useAuthUser";

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuthUser();
  const goToSignIn = () => navigate("/signin");

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, navigate]);

  if (loading || user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-0 right-0 w-[800px] h-[800px] rounded-full bg-glow/25 blur-[120px] mix-blend-screen transform-gpu will-change-transform"
          animate={{ scale: [1, 1.2, 1], opacity: [0.25, 0.45, 0.25] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full bg-glow-2/20 blur-[110px] mix-blend-screen transform-gpu will-change-transform"
          animate={{ scale: [1, 1.3, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <nav className="relative z-10 bg-background/40 backdrop-blur-2xl border-b border-border/40">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <motion.div
              className="flex items-center gap-2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="p-2 bg-gradient-to-br from-primary to-accent rounded-xl shadow-lg shadow-primary/40">
                <Sparkles className="w-5 h-5" />
              </div>
              <span className="text-xl tracking-tight">Badminton AI Analyst</span>
            </motion.div>

            <motion.button
              onClick={goToSignIn}
              className="px-6 py-2.5 bg-gradient-to-br from-primary to-accent rounded-full shadow-lg shadow-primary/40 hover:shadow-xl hover:shadow-primary/60 transition-all"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Sign In
            </motion.button>
          </div>
        </div>
      </nav>

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32">
        <div className="text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/20 rounded-full mb-8 backdrop-blur-sm">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">AI-Powered Performance Analysis</span>
            </div>
          </motion.div>

          <motion.h1
            className="text-7xl md:text-8xl mb-6 bg-gradient-to-br from-foreground via-muted-foreground to-primary bg-clip-text text-transparent leading-tight"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            Elevate Your Game
          </motion.h1>

          <motion.p
            className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-12 leading-relaxed"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            Transform your badminton performance with AI-powered video analysis, intelligent insights, and precision shot tracking.
          </motion.p>

          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            <button
              onClick={goToSignIn}
              className="group px-8 py-4 bg-gradient-to-br from-primary via-primary to-accent rounded-2xl shadow-2xl shadow-primary/40 hover:shadow-primary/60 transition-all flex items-center gap-2 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="relative text-lg">Get Started</span>
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform relative" />
            </button>

            <button className="px-8 py-4 bg-card/40 backdrop-blur-sm border border-border/50 hover:bg-card/60 hover:border-primary/40 rounded-2xl transition-all flex items-center gap-2">
              <Play className="w-5 h-5" />
              <span className="text-lg">Watch Demo</span>
            </button>
          </motion.div>
        </div>

        {/* Features */}
        <div className="mt-32 grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Play,
              title: "Frame-by-Frame Analysis",
              description: "Advanced video playback with AI-powered frame analysis to identify every critical moment.",
              gradient: "from-primary/10 to-accent/10",
              iconBg: "from-primary to-accent",
              delay: 0.6,
            },
            {
              icon: Brain,
              title: "AI Chat Agent",
              description: "Get instant insights and personalized coaching advice from our intelligent AI assistant.",
              gradient: "from-primary/10 to-accent/10",
              iconBg: "from-primary to-accent",
              delay: 0.7,
            },
            {
              icon: TrendingUp,
              title: "Shot Heatmaps",
              description: "Visualize your performance with precision court mapping and detailed shot analytics.",
              gradient: "from-primary/10 to-accent/10",
              iconBg: "from-primary to-accent",
              delay: 0.8,
            },
          ].map((feature, index) => (
            <motion.div
              key={index}
              className={`group relative bg-gradient-to-br ${feature.gradient} backdrop-blur-sm border border-border/50 rounded-3xl p-8 hover:border-primary/50 transition-all`}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: feature.delay }}
              whileHover={{ scale: 1.02 }}
            >
              <div className={`inline-flex p-4 bg-gradient-to-br ${feature.iconBg} rounded-2xl shadow-lg shadow-primary/30 mb-6`}>
                <feature.icon className="w-7 h-7" />
              </div>

              <h3 className="text-2xl mb-3 text-foreground">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{feature.description}</p>

              <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/8 group-hover:to-transparent rounded-3xl transition-all pointer-events-none" />
            </motion.div>
          ))}
        </div>

        {/* Stats */}
        <motion.div
          className="mt-32 relative"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.9 }}
        >
          <div className="bg-gradient-to-br from-card/70 to-background/40 backdrop-blur-xl border border-border/50 rounded-3xl p-12 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />

            <div className="relative grid md:grid-cols-3 gap-12 text-center">
              {[
                { value: "99.9%", label: "Shot Detection Accuracy" },
                { value: "< 1s", label: "Analysis Speed" },
                { value: "24/7", label: "AI Assistant Available" },
              ].map((stat, index) => (
                <div key={index}>
                  <div className="text-5xl md:text-6xl mb-2 bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent font-semibold">
                    {stat.value}
                  </div>
                  <div className="text-muted-foreground text-lg">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div
          className="mt-32 text-center"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1.0 }}
        >
          <h2 className="text-5xl md:text-6xl mb-6 bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-transparent">
            Ready to transform your game?
          </h2>
          <p className="text-xl text-muted-foreground mb-10">
            Join the future of badminton performance analysis.
          </p>
          <button
            onClick={goToSignIn}
            className="group px-10 py-5 bg-gradient-to-br from-primary via-primary to-accent rounded-2xl shadow-2xl shadow-primary/40 hover:shadow-primary/60 transition-all flex items-center gap-3 mx-auto relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <Zap className="w-6 h-6 relative" />
            <span className="relative text-xl">Start Analyzing Now</span>
            <ChevronRight className="w-6 h-6 group-hover:translate-x-1 transition-transform relative" />
          </button>
        </motion.div>
      </div>

      <div className="relative z-10 border-t border-border/40 py-8 mt-20">
        <div className="max-w-7xl mx-auto px-6 text-center text-muted-foreground text-sm">
          © 2026 Badminton AI Analyst. Powered by YOLOv8 and TrackNetV2.
        </div>
      </div>
    </div>
  );
}