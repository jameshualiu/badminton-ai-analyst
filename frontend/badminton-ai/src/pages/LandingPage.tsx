import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { motion } from "motion/react";
import { BarChart2, ChevronRight, Moon, Play, Sparkles, Sun, TrendingUp, Zap } from "lucide-react";
import { useAuthUser } from "../auth/hooks/useAuthUser";
import { useTheme } from "../context/ThemeContext";

const FEATURES = [
    { icon: Play, title: "Shot-by-Shot Analysis", description: "Advanced video playback with AI-powered frame analysis to identify every critical moment." },
    { icon: BarChart2, title: "Match Statistics", description: "Instant breakdown of shot counts by type, match duration, and total rally data extracted directly from your footage." },
    { icon: TrendingUp, title: "Shot Heatmaps", description: "Visualize your performance with precision court mapping and detailed shot analytics." },
];

const STATS = [
    { value: "99.9%", label: "Shot Detection Accuracy" },
    { value: "< 30s", label: "Analysis Time" },
    { value: "FREE", label: "Lifetime Access" },
];

export default function LandingPage() {
    const navigate = useNavigate();
    const { user, loading } = useAuthUser();
    const { isDark, toggle } = useTheme();

    useEffect(() => {
        if (!loading && user) navigate("/dashboard", { replace: true });
    }, [user, loading, navigate]);

    if (loading || user) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="w-10 h-10 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

            {/* Background */}
            <div className="fixed inset-0 pointer-events-none" aria-hidden="true">
                <div
                    className="dot-grid absolute inset-0 opacity-[0.45]"
                    style={{ backgroundSize: "22px 22px" }}
                />
                <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-primary/8 blur-[100px]" />
                <div className="absolute -bottom-24 -left-24 w-[500px] h-[500px] rounded-full bg-primary/6 blur-[90px]" />
            </div>

            {/* Navbar */}
            <nav className="sticky top-0 z-50 w-full bg-white/90 dark:bg-background/90 backdrop-blur-xl border-b border-slate-200 dark:border-border">
                <div className="max-w-[1400px] mx-auto px-8 h-[70px] flex items-center justify-between">
                    <motion.div
                        className="flex items-center gap-2"
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="p-1.5 bg-primary/10 border border-primary/20 rounded-lg">
                            <Sparkles className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-[17px] font-semibold tracking-tight text-foreground">Shuttleye</span>
                    </motion.div>

                    <motion.div
                        className="flex items-center gap-3"
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <button
                            onClick={toggle}
                            aria-label="Toggle dark mode"
                            className="cursor-pointer relative w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-foreground transition-all duration-150"
                        >
                            <Sun className={`absolute w-4 h-4 transition-all duration-200 ${isDark ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"}`} />
                            <Moon className={`absolute w-4 h-4 transition-all duration-200 ${isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"}`} />
                        </button>
                        <button
                            onClick={() => navigate("/signin")}
                            className="cursor-pointer px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] transition-all duration-150"
                        >
                            Sign In
                        </button>
                    </motion.div>
                </div>
            </nav>

            {/* Hero */}
            <section className="relative z-10 pt-28 pb-24 px-6 text-center">
                <div className="max-w-4xl mx-auto">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 rounded-full mb-8 text-sm font-medium text-primary">
                            <Sparkles className="w-3.5 h-3.5" />
                            AI-Powered Performance Analysis
                        </div>
                    </motion.div>

                    <motion.h1
                        className="text-6xl md:text-8xl font-bold tracking-tight text-foreground leading-[1.05] mb-6"
                        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}
                    >
                        Elevate Your<br />
                        <span className="text-primary">Game</span>
                    </motion.h1>

                    <motion.p
                        className="text-lg md:text-xl text-slate-500 dark:text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed"
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
                    >
                        Transform your badminton performance with AI-powered video analysis, intelligent insights, and precision shot tracking.
                    </motion.p>

                    <motion.div
                        className="flex flex-col sm:flex-row items-center justify-center gap-3"
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }}
                    >
                        <button
                            onClick={() => navigate("/signup")}
                            className="cursor-pointer flex items-center gap-2 px-8 py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] transition-all duration-150"
                        >
                            Get Started
                            <ChevronRight className="w-4 h-4" />
                        </button>
                        <button className="cursor-pointer flex items-center gap-2 px-8 py-3.5 bg-white dark:bg-card text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-border rounded-xl font-semibold hover:bg-slate-50 dark:hover:bg-white/10 hover:border-slate-400 dark:hover:border-border hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] transition-all duration-150">
                            <Play className="w-4 h-4" />
                            Watch Demo
                        </button>
                    </motion.div>
                </div>
            </section>

            {/* Features */}
            <section className="relative z-10 max-w-7xl mx-auto px-6 pb-20">
                <div className="grid md:grid-cols-3 gap-5">
                    {FEATURES.map((feature, i) => (
                        <motion.div
                            key={i}
                            className="bg-white dark:bg-card border border-slate-300 dark:border-border rounded-2xl p-7 shadow-sm hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-150 cursor-default"
                            initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }}
                        >
                            <div className="inline-flex p-3 bg-primary/10 border border-primary/25 rounded-xl mb-5">
                                <feature.icon className="w-5 h-5 text-primary" />
                            </div>
                            <h3 className="text-[17px] font-semibold text-foreground mb-2">{feature.title}</h3>
                            <p className="text-[14px] text-slate-500 dark:text-slate-400 leading-relaxed">{feature.description}</p>
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Stats */}
            <motion.section
                className="relative z-10 max-w-7xl mx-auto px-6 pb-20"
                initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
            >
                <div className="bg-white dark:bg-card border border-slate-300 dark:border-border rounded-2xl p-10 shadow-sm">
                    <div className="grid md:grid-cols-3 gap-10 text-center divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-border">
                        {STATS.map((s, i) => (
                            <div key={i} className="pt-6 md:pt-0 first:pt-0">
                                <div className="text-5xl font-bold text-primary mb-1.5">{s.value}</div>
                                <div className="text-sm text-slate-500 dark:text-slate-400 font-medium">{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </motion.section>

            {/* Bottom CTA */}
            <motion.section
                className="relative z-10 max-w-7xl mx-auto px-6 pb-24"
                initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
            >
                <div className="p-14 text-center">
                    <h2 className="text-4xl md:text-5xl font-bold text-slate-900 dark:text-white mb-4">Ready to transform your game?</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-lg mb-10">Join the future of badminton performance analysis.</p>
                    <button
                        onClick={() => navigate("/signin")}
                        className="cursor-pointer inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] transition-all duration-150"
                    >
                        <Zap className="w-5 h-5" />
                        Start Analyzing Now
                    </button>
                </div>
            </motion.section>

            {/* Footer */}
            <footer className="border-t border-slate-200 dark:border-border py-7">
                <div className="max-w-7xl mx-auto px-6 text-center text-sm text-slate-400 dark:text-slate-500">
                    © 2026 Shuttleye. Powered by YOLOv8 and TrackNetV2.
                </div>
            </footer>
        </div>
    );
}
