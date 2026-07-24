import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { motion } from "motion/react";
import { ChevronRight, Moon, Play, Sparkles, Sun, Zap } from "lucide-react";
import { useAuthUser } from "../auth/hooks/useAuthUser";
import { useTheme } from "../context/useTheme";

// ── Illustrated panels ────────────────────────────────────────────────────────

function WindowChrome({ title, right }: { title: string; right?: React.ReactNode }) {
    return (
        <div className="flex items-center gap-1.5 px-3 py-2.5 bg-white/[0.03] border-b border-border text-[11px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-[#ff5f56]" />
            <span className="w-2 h-2 rounded-full bg-[#ffbd2e]" />
            <span className="w-2 h-2 rounded-full bg-[#27c93f]" />
            <span className="ml-2">{title}</span>
            {right && <span className="ml-auto">{right}</span>}
        </div>
    );
}

function UploadPanel() {
    return (
        <div className="bg-card/70 backdrop-blur-md border border-primary/25 rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
            <WindowChrome title="Upload match footage" />
            <div className="m-4 border-2 border-dashed border-primary/25 rounded-xl p-6 text-center bg-primary/[0.04]">
                <div className="flex justify-center mb-2.5 text-primary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                </div>
                <p className="text-sm font-bold mb-1">Drop your match video here</p>
                <p className="text-xs text-muted-foreground mb-3">MP4, MOV or AVI · up to 2 GB</p>
                <span className="inline-block px-4 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg">Choose file</span>
            </div>
        </div>
    );
}

function ProcessingPanel() {
    const steps = [
        { label: "Court detection",     pct: 100, done: true },
        { label: "Player tracking",     pct: 100, done: true },
        { label: "Shuttle tracking",    pct: 72,  pulse: true },
        { label: "Shot classification", pct: 0,   waiting: true },
    ];
    return (
        <div className="bg-card/70 backdrop-blur-md border border-primary/25 rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
            <WindowChrome title="Analysing footage…" />
            <div className="p-4 space-y-3">
                <div className="bg-black rounded-lg h-32 relative overflow-hidden">
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 130" preserveAspectRatio="xMidYMid slice">
                        <rect width="400" height="130" fill="#060d14" />
                        <rect x="60" y="10" width="280" height="110" fill="rgba(22,78,46,0.5)" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                        <line x1="60" y1="65" x2="340" y2="65" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
                        <circle cx="150" cy="32" r="4" fill="#89c2d9" />
                        <circle cx="260" cy="90" r="4" fill="#2c7da0" />
                        <circle cx="205" cy="58" r="3" fill="#fff" /><circle cx="205" cy="58" r="6" fill="rgba(255,255,255,0.12)" />
                    </svg>
                </div>
                <div className="space-y-2">
                    {steps.map((s) => (
                        <div key={s.label} className="flex items-center gap-2.5 text-[12px]">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.done ? "#10b981" : s.pulse ? "var(--color-primary)" : "#424960" }} />
                            <span className={`flex-1 ${s.waiting ? "text-muted-foreground/40" : "text-muted-foreground"}`}>{s.label}</span>
                            <div className="w-20 h-[3px] bg-white/[0.06] rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.done ? "#10b981" : s.pulse ? "var(--color-primary)" : "transparent" }} />
                            </div>
                            <span className={`text-[11px] font-semibold w-7 text-right ${s.done ? "text-[#10b981]" : s.pulse ? "text-primary" : "text-muted-foreground/30"}`}>
                                {s.done ? "Done" : s.pulse ? "72%" : "—"}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function ResultsPanel() {
    const shots = [
        { t: "0:12", color: "var(--color-primary)", name: "Clear", pos: "3.1, 1.2", hi: true },
        { t: "0:15", color: "#f59e0b", name: "Smash", pos: "4.8, 0.6" },
        { t: "0:17", color: "#10b981", name: "Drop",  pos: "2.9, 2.1" },
        { t: "0:21", color: "#8b5cf6", name: "Net",   pos: "3.2, 3.8" },
    ];
    return (
        <div className="bg-card/70 backdrop-blur-md border border-primary/25 rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
            <WindowChrome title="Results" right={<span className="text-primary font-bold">47 shots</span>} />
            <div className="p-3.5 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                    {([["Shots","47","text-primary"],["Rallies","8",""],["Time","4:12",""]] as [string,string,string][]).map(([l,v,c]) => (
                        <div key={l} className="bg-white/[0.03] border border-border rounded-lg p-2 text-center">
                            <div className="text-[8px] font-bold uppercase tracking-wide text-muted-foreground mb-1">{l}</div>
                            <div className={`text-lg font-black tabular-nums ${c}`}>{v}</div>
                        </div>
                    ))}
                </div>
                <div>
                    {shots.map((s) => (
                        <div key={s.t} className={`flex items-center gap-2 px-2 py-1.5 rounded text-[11px] border-b border-white/[0.04] ${s.hi ? "bg-primary/10 border-l-2 border-primary" : ""}`}>
                            <span className="text-primary font-bold w-7 flex-shrink-0">{s.t}</span>
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                            <span className={`font-semibold flex-1 ${s.hi ? "text-primary" : "text-muted-foreground"}`}>{s.name}</span>
                            <span className="text-[9px] text-muted-foreground/40">{s.pos}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function ShotLogPanel() {
    const rows = [
        { t: "0:12", color: "var(--color-primary)", name: "Clear", pos: "3.1, 1.2", hi: true },
        { t: "0:15", color: "#f59e0b", name: "Smash", pos: "4.8, 0.6" },
        { t: "0:17", color: "#10b981", name: "Drop",  pos: "2.9, 2.1" },
        { t: "0:21", color: "#8b5cf6", name: "Net",   pos: "3.2, 3.8" },
        { t: "0:24", color: "#f59e0b", name: "Smash", pos: "5.1, 0.4" },
        { t: "0:28", color: "var(--color-primary)", name: "Clear", pos: "1.8, 1.9" },
    ];
    return (
        <div className="bg-card/70 backdrop-blur-md border border-primary/25 rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
            <WindowChrome title="Shot Log" right={<span className="text-primary font-bold">47</span>} />
            <div className="p-3">
                {rows.map((r) => (
                    <div key={r.t + r.name} className={`flex items-center gap-2 px-2 py-1.5 rounded text-[11px] border-b border-white/[0.04] ${r.hi ? "bg-primary/10 border-l-2 border-l-primary" : ""}`}>
                        <span className="text-primary font-bold w-7 flex-shrink-0">{r.t}</span>
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: r.color }} />
                        <span className={`font-semibold flex-1 ${r.hi ? "text-primary" : "text-muted-foreground"}`}>{r.name}</span>
                        <span className="text-[9px] text-muted-foreground/40">{r.pos}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function HeatmapPanel() {
    const legend = [
        { color: "var(--color-primary)", label: "Clear", w: "100%", n: 19 },
        { color: "#f59e0b", label: "Smash", w: "68%", n: 13 },
        { color: "#8b5cf6", label: "Net",   w: "42%", n: 8  },
        { color: "#10b981", label: "Drop",  w: "28%", n: 6  },
    ];
    return (
        <div className="bg-card/70 backdrop-blur-md border border-primary/25 rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
            <WindowChrome title="Shot Heatmap" />
            <div className="p-3 flex gap-3 items-start">
                <svg viewBox="0 0 130 272" className="w-[72px] h-[150px] flex-shrink-0">
                    <rect width="130" height="272" fill="rgba(8,16,28,0.9)" rx="4" />
                    <rect x="16" y="20" width="98" height="232" fill="rgba(22,78,46,0.8)" />
                    <rect x="16" y="20" width="98" height="232" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.2" />
                    <line x1="16" y1="136" x2="114" y2="136" stroke="rgba(255,255,255,0.9)" strokeWidth="2" />
                    <line x1="16" y1="105" x2="114" y2="105" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
                    <line x1="16" y1="167" x2="114" y2="167" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8" />
                    <circle cx="32" cy="45" r="3.5" fill="var(--color-primary,#796faa)" opacity="0.85" />
                    <circle cx="80" cy="55" r="3.5" fill="var(--color-primary,#796faa)" opacity="0.85" />
                    <circle cx="55" cy="40" r="3.5" fill="var(--color-primary,#796faa)" opacity="0.85" />
                    <circle cx="72" cy="115" r="3.5" fill="#f59e0b" opacity="0.85" />
                    <circle cx="38" cy="125" r="3.5" fill="#f59e0b" opacity="0.85" />
                    <circle cx="60" cy="230" r="3.5" fill="#10b981" opacity="0.85" />
                    <circle cx="45" cy="220" r="3.5" fill="#10b981" opacity="0.85" />
                    <circle cx="65" cy="180" r="3.5" fill="#8b5cf6" opacity="0.85" />
                    <circle cx="52" cy="175" r="3.5" fill="#8b5cf6" opacity="0.85" />
                    <circle cx="30" cy="200" r="3.5" fill="var(--color-primary,#796faa)" opacity="0.85" />
                </svg>
                <div className="flex-1 flex flex-col justify-center gap-2.5 py-1">
                    {legend.map((l) => (
                        <div key={l.label} className="flex items-center gap-2 text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: l.color }} />
                            <span className="text-muted-foreground/60 w-8 flex-shrink-0">{l.label}</span>
                            <div className="flex-1 h-[3px] bg-white/[0.06] rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: l.w, background: l.color }} />
                            </div>
                            <span className="font-bold w-4 text-right tabular-nums">{l.n}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function RallyPanel() {
    const dots1 = ["var(--color-primary)", "#f59e0b", "#10b981", "var(--color-primary)", "#f59e0b", "#8b5cf6", "var(--color-primary)", "#f59e0b"];
    const dots2 = ["var(--color-primary)", "#10b981", "var(--color-primary)", "#f59e0b", "#8b5cf6", "var(--color-primary)"];
    return (
        <div className="bg-card/70 backdrop-blur-md border border-primary/25 rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.25)]">
            <WindowChrome title="Rally Analysis" right={<span>8 rallies</span>} />
            <div className="p-3 space-y-3">
                <div className="grid grid-cols-4 gap-1.5">
                    {([["Rallies","8","text-primary"],["Longest","14","text-amber-400"],["Avg","5.8",""],["&gt;5","62%","text-emerald-400"]] as [string,string,string][]).map(([l,v,c]) => (
                        <div key={l} className="bg-white/[0.04] border border-border rounded-lg p-2 text-center">
                            <div className="text-[8px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">{l.replace("&gt;", ">")}</div>
                            <div className={`text-sm font-black ${c}`}>{v}</div>
                        </div>
                    ))}
                </div>
                {[
                    { n:"#1", time:"0:12–0:35", grad:"linear-gradient(90deg,#f59e0b,#d97706)", w:"100%", shots:14, c:"text-amber-400", dots:dots1 },
                    { n:"#2", time:"0:42–0:58", grad:"linear-gradient(90deg,var(--color-primary),#0891b2)", w:"64%", shots:9, c:"", dots:dots2 },
                ].map((r) => (
                    <div key={r.n} className="flex items-center gap-2.5 text-[11px] border-b border-white/[0.05] pb-2">
                        <span className="text-muted-foreground font-bold w-4">{r.n}</span>
                        <div className="flex-1">
                            <div className="text-[9px] text-muted-foreground/40 mb-1">{r.time}</div>
                            <div className="h-[3px] bg-white/[0.06] rounded-full overflow-hidden mb-1.5">
                                <div className="h-full rounded-full" style={{ width: r.w, background: r.grad }} />
                            </div>
                            <div className="flex gap-1">
                                {r.dots.map((d, i) => <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: d }} />)}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className={`text-sm font-black ${r.c}`}>{r.shots}</div>
                            <div className="text-[9px] text-muted-foreground">shots</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const STATS = [
    { value: "99.9%", label: "Shot Detection Accuracy" },
    { value: "<30s",  label: "Average Analysis Time" },
    { value: "FREE",  label: "Lifetime Access" },
];

const HOW_STEPS = [
    { n: "1", title: "Upload your match", desc: "Drop in an MP4. Shuttleye accepts any standard court recording.", panel: <UploadPanel /> },
    { n: "2", title: "AI analyses everything", desc: "YOLOv8 detects players and shots. TrackNetV2 tracks the shuttle frame by frame.", panel: <ProcessingPanel /> },
    { n: "3", title: "Explore your results", desc: "Shot log, court heatmap, rally breakdown — ready in under 30 seconds.", panel: <ResultsPanel /> },
];

const FEATURES = [
    {
        tag: "Shot Log", title: "Every stroke, timestamped and colour-coded",
        desc: "A complete scrollable record of every stroke — colour-coded by type, with court coordinates and timestamps.",
        bullets: ["Click any row to jump to that moment in the video", "Active shot highlights as video plays", "Clears, smashes, drops, nets, drives and more"],
        panel: <ShotLogPanel />, reverse: false,
    },
    {
        tag: "Court Heatmap", title: "See exactly where you play on court",
        desc: "Every shot mapped to a precise court coordinate. Filter by type to reveal patterns you never noticed.",
        bullets: ["Court geometry auto-detected from video", "Filter dots by shot type with one click", "Spot if you're over-relying on one zone"],
        panel: <HeatmapPanel />, reverse: true,
    },
    {
        tag: "Rally Analysis", title: "Rally by rally, shot by shot",
        desc: "Rallies grouped and ranked by length. See your longest exchanges, average depth, and the exact shot sequence.",
        bullets: ["Click any rally to jump to it in the video", "Shot-type dots show the sequence at a glance", "Total, longest, avg, % over 5 shots"],
        panel: <RallyPanel />, reverse: false,
    },
];

const fade = { initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true }, transition: { duration: 0.5 } };

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
                <div className="dot-grid absolute inset-0 opacity-[0.45]" style={{ backgroundSize: "22px 22px" }} />
                <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full bg-primary/8 blur-[100px]" />
                <div className="absolute -bottom-24 -left-24 w-[500px] h-[500px] rounded-full bg-primary/6 blur-[90px]" />
            </div>

            {/* Navbar */}
            <nav className="sticky top-0 z-50 w-full bg-white/90 dark:bg-background/90 backdrop-blur-xl border-b border-slate-200 dark:border-border">
                <div className="max-w-[1400px] mx-auto px-8 h-[70px] flex items-center justify-between">
                    <motion.div className="flex items-center gap-2" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
                        <div className="p-1.5 bg-primary/10 border border-primary/20 rounded-lg">
                            <Sparkles className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-[17px] font-semibold tracking-tight">Shuttleye</span>
                    </motion.div>
                    <motion.div className="flex items-center gap-3" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}>
                        <button onClick={toggle} aria-label="Toggle dark mode" className="cursor-pointer relative w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-foreground transition-all duration-150">
                            <Sun className={`absolute w-4 h-4 transition-all duration-200 ${isDark ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"}`} />
                            <Moon className={`absolute w-4 h-4 transition-all duration-200 ${isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"}`} />
                        </button>
                        <button onClick={() => navigate("/signin")} className="cursor-pointer px-5 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150">
                            Sign In
                        </button>
                    </motion.div>
                </div>
            </nav>

            {/* Hero */}
            <section className="relative z-10 pt-32 pb-40 px-6 text-center">
                <div className="max-w-4xl mx-auto">
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 rounded-full mb-8 text-sm font-medium text-primary">
                            <Sparkles className="w-3.5 h-3.5" />
                            AI-Powered Performance Analysis
                        </div>
                    </motion.div>
                    <motion.h1 className="text-6xl md:text-8xl font-bold tracking-tight leading-[1.05] mb-6" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.2 }}>
                        Elevate Your<br /><span className="text-primary">Game</span>
                    </motion.h1>
                    <motion.p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}>
                        Transform your badminton performance with AI-powered video analysis, intelligent insights, and precision shot tracking.
                    </motion.p>
                    <motion.div className="flex flex-col sm:flex-row items-center justify-center gap-3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.4 }}>
                        <button onClick={() => navigate("/signup")} className="cursor-pointer flex items-center gap-2 px-8 py-3.5 bg-primary text-primary-foreground rounded-xl font-semibold hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150">
                            Get Started <ChevronRight className="w-4 h-4" />
                        </button>
                        <button className="cursor-pointer flex items-center gap-2 px-8 py-3.5 bg-white dark:bg-card text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-border rounded-xl font-semibold hover:bg-slate-50 dark:hover:bg-white/10 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150">
                            <Play className="w-4 h-4" /> Watch Demo
                        </button>
                    </motion.div>
                </div>
            </section>

            {/* How it works */}
            <section className="relative z-10 max-w-7xl mx-auto px-6 py-24">
                <motion.div className="text-center mb-14" {...fade}>
                    <div className="text-[11px] font-bold tracking-[2.5px] uppercase text-primary mb-3">How it works</div>
                    <h2 className="text-4xl font-bold tracking-tight">From footage to insights in seconds</h2>
                </motion.div>
                <div className="grid md:grid-cols-3 gap-6">
                    {HOW_STEPS.map((s, i) => (
                        <motion.div key={i} {...fade} transition={{ duration: 0.5, delay: i * 0.1 }}>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/25 text-primary text-xs font-black flex items-center justify-center flex-shrink-0">{s.n}</div>
                                <div>
                                    <div className="text-sm font-bold">{s.title}</div>
                                    <div className="text-xs text-muted-foreground leading-relaxed">{s.desc}</div>
                                </div>
                            </div>
                            {s.panel}
                        </motion.div>
                    ))}
                </div>
            </section>

            {/* Feature deep-dives */}
            <section className="relative z-10 max-w-7xl mx-auto px-6 py-24 space-y-32">
                <motion.div className="text-center" {...fade}>
                    <div className="text-[11px] font-bold tracking-[2.5px] uppercase text-primary mb-3">Features</div>
                    <h2 className="text-4xl font-bold tracking-tight">Everything in your match,<br />laid out clearly</h2>
                </motion.div>
                {FEATURES.map((f, i) => (
                    <motion.div key={i} {...fade} transition={{ duration: 0.5, delay: 0.1 }}>
                        <div className={`grid md:grid-cols-2 gap-12 items-center ${f.reverse ? "md:[direction:rtl]" : ""}`}>
                            <div className="md:[direction:ltr]">{f.panel}</div>
                            <div className="md:[direction:ltr]">
                                <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-primary bg-primary/10 border border-primary/25 rounded px-2.5 py-1 mb-4">{f.tag}</span>
                                <h3 className="text-2xl font-bold tracking-tight mb-3">{f.title}</h3>
                                <p className="text-[15px] text-muted-foreground leading-relaxed mb-5">{f.desc}</p>
                                <ul className="space-y-2.5">
                                    {f.bullets.map((b) => (
                                        <li key={b} className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
                                            <span className="w-1 h-1 rounded-full bg-primary flex-shrink-0" />
                                            {b}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </section>

            {/* Stats */}
            <motion.section className="relative z-10 max-w-7xl mx-auto px-6 py-20" {...fade}>
                <div className="bg-white dark:bg-card border border-slate-300 dark:border-border rounded-2xl p-10 shadow-sm">
                    <div className="grid md:grid-cols-3 gap-10 text-center divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-border">
                        {STATS.map((s, i) => (
                            <div key={i} className="pt-6 md:pt-0 first:pt-0">
                                <div className="text-5xl font-bold text-primary mb-1.5">{s.value}</div>
                                <div className="text-sm text-muted-foreground font-medium">{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </motion.section>

            {/* CTA */}
            <motion.section className="relative z-10 max-w-7xl mx-auto px-6 py-24 text-center" {...fade}>
                <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Ready to transform your game?</h2>
                <p className="text-muted-foreground text-lg mb-10">Join the future of badminton performance analysis. Free forever.</p>
                <button onClick={() => navigate("/signup")} className="cursor-pointer inline-flex items-center gap-2 px-8 py-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150">
                    <Zap className="w-5 h-5" />
                    Start Analysing Now
                </button>
            </motion.section>

            {/* Footer */}
            <footer className="border-t border-slate-200 dark:border-border py-7">
                <div className="max-w-7xl mx-auto px-6 text-center text-sm text-muted-foreground">
                    © 2026 Shuttleye. Powered by YOLOv8 and TrackNetV2.
                </div>
            </footer>
        </div>
    );
}
