import { useState } from "react";
import { VideoAnalysis } from "./components/VideoAnalysis";
import { Dashboard } from "./components/Dashboard";
import { AIChat } from "./components/AIChat";
import { PlayCircle, LayoutDashboard, MessageSquare } from "lucide-react";

type View = "dashboard" | "analysis" | "chat";

export default function App() {
    const [currentView, setCurrentView] = useState<View>("dashboard");
    const [selectedVideo, setSelectedVideo] = useState<string | null>(null);

    const handleVideoSelect = (videoId: string) => {
        setSelectedVideo(videoId);
        setCurrentView("analysis");
    };

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-purple-900/20">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        <h1 className="text-xl tracking-tight font-[Poppins]">
                            Badminton AI Analyst
                        </h1>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setCurrentView("dashboard")}
                                className={`px-4 py-2 rounded-full transition-all ${
                                    currentView === "dashboard"
                                        ? "bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-lg shadow-purple-500/50 hover:shadow-lg hover:shadow-purple-500/60"
                                        : "text-gray-400 hover:text-white hover:bg-white/5 border border-white/10"
                                }`}
                            >
                                <div className="flex items-center gap-2 font-[Poppins]">
                                    <LayoutDashboard className="w-4 h-4" />
                                    <span>Dashboard</span>
                                </div>
                            </button>

                            <button
                                onClick={() => setCurrentView("analysis")}
                                className={`px-4 py-2 rounded-full transition-all ${
                                    currentView === "analysis"
                                        ? "bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-lg shadow-purple-500/50 hover:shadow-lg hover:shadow-purple-500/60"
                                        : "text-gray-400 hover:text-white hover:bg-white/5 border border-white/10"
                                }`}
                            >
                                <div className="flex items-center gap-2 font-[Poppins]">
                                    <PlayCircle className="w-4 h-4" />
                                    <span>Analysis</span>
                                </div>
                            </button>

                            <button
                                onClick={() => setCurrentView("chat")}
                                className={`px-4 py-2 rounded-full transition-all ${
                                    currentView === "chat"
                                        ? "bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-lg shadow-purple-500/50 hover:shadow-lg hover:shadow-purple-500/60"
                                        : "text-gray-400 hover:text-white hover:bg-white/5 border border-white/10"
                                }`}
                            >
                                <div className="flex items-center gap-2 font-[Poppins]">
                                    <MessageSquare className="w-4 h-4" />
                                    <span>AI Agent</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <div className="pt-20">
                {currentView === "dashboard" && (
                    <Dashboard onVideoSelect={handleVideoSelect} />
                )}
                {currentView === "analysis" && (
                    <VideoAnalysis videoId={selectedVideo} />
                )}
                {currentView === "chat" && <AIChat />}
            </div>
        </div>
    );
}
