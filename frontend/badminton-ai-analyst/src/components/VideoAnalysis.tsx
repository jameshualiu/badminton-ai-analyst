import { useState, useRef } from "react";
import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { ShotHeatmap } from "./ShotHeatmap";
import { motion, AnimatePresence } from "motion/react";

interface VideoAnalysisProps {
    videoId: string | null;
}

export function VideoAnalysis({ videoId }: VideoAnalysisProps) {
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration] = useState(2732); // 45:32 in seconds
    const videoRef = useRef<HTMLVideoElement>(null);

    const togglePlay = () => {
        setIsPlaying(!isPlaying);
    };

    const stepFrame = (direction: "forward" | "backward") => {
        const step = direction === "forward" ? 0.033 : -0.033; // ~1 frame at 30fps
        setCurrentTime(Math.max(0, Math.min(duration, currentTime + step)));
    };

    const skip = (seconds: number) => {
        setCurrentTime(Math.max(0, Math.min(duration, currentTime + seconds)));
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    // Mock shot data for the current frame
    const currentShot = {
        type: "Smash",
        speed: "287 km/h",
        angle: "42°",
        position: { x: 65, y: 30 },
    };

    return (
        <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Video Player Section */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Video Container */}
                    <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-purple-900/20">
                        {/* Placeholder video - in production this would be the actual video */}
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-950/40 to-black flex items-center justify-center">
                            <video
                                ref={videoRef}
                                className="w-full h-full object-cover opacity-70"
                                poster="https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=1200"
                            >
                                <source
                                    src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
                                    type="video/mp4"
                                />
                            </video>
                        </div>

                        {/* Analysis Overlays */}
                        <AnimatePresence>
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="absolute inset-0 pointer-events-none"
                            >
                                {/* Shot trajectory line */}
                                <svg className="absolute inset-0 w-full h-full">
                                    <motion.path
                                        d="M 100 400 Q 400 100 700 350"
                                        stroke="#a855f7"
                                        strokeWidth="3"
                                        fill="none"
                                        initial={{ pathLength: 0 }}
                                        animate={{ pathLength: 1 }}
                                        transition={{ duration: 0.5 }}
                                    />
                                    <motion.circle
                                        cx={currentShot.position.x * 10}
                                        cy={currentShot.position.y * 10}
                                        r="8"
                                        fill="#a855f7"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: [1, 1.5, 1] }}
                                        transition={{
                                            repeat: Infinity,
                                            duration: 1.5,
                                        }}
                                    />
                                </svg>

                                {/* Shot info overlay */}
                                <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-xl border border-purple-500/30 rounded-xl p-4 pointer-events-auto">
                                    <div className="space-y-2">
                                        <div>
                                            <p className="text-xs text-gray-400">
                                                Shot Type
                                            </p>
                                            <p className="text-purple-400">
                                                {currentShot.type}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-400">
                                                Speed
                                            </p>
                                            <p className="text-white">
                                                {currentShot.speed}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-400">
                                                Angle
                                            </p>
                                            <p className="text-white">
                                                {currentShot.angle}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    </div>

                    {/* Controls */}
                    <div className="bg-gradient-to-br from-purple-950/20 to-black border border-purple-900/20 rounded-2xl p-6">
                        {/* Timeline */}
                        <div className="mb-6">
                            <input
                                type="range"
                                min="0"
                                max={duration}
                                value={currentTime}
                                onChange={(e) =>
                                    setCurrentTime(Number(e.target.value))
                                }
                                className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-purple-600"
                            />
                            <div className="flex justify-between mt-2 text-sm text-gray-400">
                                <span>{formatTime(currentTime)}</span>
                                <span>{formatTime(duration)}</span>
                            </div>
                        </div>

                        {/* Playback Controls */}
                        <div className="flex items-center justify-center gap-2">
                            <button
                                onClick={() => skip(-10)}
                                className="p-3 hover:bg-white/5 rounded-full transition-colors"
                            >
                                <SkipBack className="w-5 h-5" />
                            </button>

                            <button
                                onClick={() => stepFrame("backward")}
                                className="p-3 hover:bg-white/5 rounded-full transition-colors"
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>

                            <button
                                onClick={togglePlay}
                                className="p-4 bg-gradient-to-br from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 rounded-full transition-all shadow-lg shadow-purple-500/50 hover:shadow-lg hover:shadow-purple-500/60"
                            >
                                {isPlaying ? (
                                    <Pause className="w-6 h-6" />
                                ) : (
                                    <Play className="w-6 h-6 ml-1" />
                                )}
                            </button>

                            <button
                                onClick={() => stepFrame("forward")}
                                className="p-3 hover:bg-white/5 rounded-full transition-colors"
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>

                            <button
                                onClick={() => skip(10)}
                                className="p-3 hover:bg-white/5 rounded-full transition-colors"
                            >
                                <SkipForward className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-center text-sm text-gray-500 mt-4">
                            Use arrow buttons for frame-by-frame analysis
                        </p>
                    </div>
                </div>

                {/* Heatmap Section */}
                <div className="space-y-6">
                    <ShotHeatmap />

                    {/* Stats */}
                    <div className="bg-gradient-to-br from-purple-950/20 to-black border border-purple-900/20 rounded-2xl p-6">
                        <h3 className="mb-4 text-gray-400">Match Statistics</h3>

                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between mb-1 text-sm">
                                    <span className="text-gray-400">
                                        Smashes
                                    </span>
                                    <span className="text-white">87</span>
                                </div>
                                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-purple-600"
                                        style={{ width: "65%" }}
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between mb-1 text-sm">
                                    <span className="text-gray-400">Drops</span>
                                    <span className="text-white">124</span>
                                </div>
                                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-purple-500"
                                        style={{ width: "85%" }}
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between mb-1 text-sm">
                                    <span className="text-gray-400">
                                        Clears
                                    </span>
                                    <span className="text-white">96</span>
                                </div>
                                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-purple-400"
                                        style={{ width: "72%" }}
                                    />
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between mb-1 text-sm">
                                    <span className="text-gray-400">
                                        Net Shots
                                    </span>
                                    <span className="text-white">35</span>
                                </div>
                                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-purple-300"
                                        style={{ width: "45%" }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
