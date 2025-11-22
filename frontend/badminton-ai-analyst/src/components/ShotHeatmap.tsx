import { motion } from "motion/react";

// Mock shot data - each shot has x, y coordinates and intensity
const shotData = [
    { x: 20, y: 15, intensity: 0.9 },
    { x: 25, y: 20, intensity: 0.7 },
    { x: 22, y: 18, intensity: 0.8 },
    { x: 80, y: 85, intensity: 0.9 },
    { x: 78, y: 88, intensity: 0.6 },
    { x: 82, y: 83, intensity: 0.8 },
    { x: 50, y: 45, intensity: 0.5 },
    { x: 48, y: 50, intensity: 0.6 },
    { x: 15, y: 80, intensity: 0.7 },
    { x: 85, y: 20, intensity: 0.8 },
    { x: 30, y: 35, intensity: 0.6 },
    { x: 70, y: 65, intensity: 0.7 },
];

export function ShotHeatmap() {
    return (
        <div className="bg-gradient-to-br from-purple-950/20 to-black border border-purple-900/20 rounded-2xl p-6">
            <h3 className="mb-4 text-gray-400">Shot Heatmap</h3>

            {/* Badminton Court */}
            <div className="relative aspect-[44/88] bg-gradient-to-br from-green-950/30 to-green-900/20 rounded-lg border-2 border-white/20 overflow-hidden">
                {/* Court lines */}
                <svg
                    className="absolute inset-0 w-full h-full"
                    preserveAspectRatio="none"
                >
                    {/* COURT DIMENSIONS REFERENCE (Metric):
      Total Length: 13.40m
      Total Width: 6.10m
      
      CALCULATED PERCENTAGES:
      - Singles Sideline offset: 0.46m / 6.10m = 7.5%
      - Back Doubles Service Line offset: 0.76m / 13.40m = 5.7%
      - Short Service Line offset (from net): 1.98m
      - Short Service Line position (from back): (6.7m - 1.98m) / 13.40m = 35.2%
  */}

                    {/* 1. OUTLINE: The outer boundary (Doubles Sideline & Back Boundary) */}
                    <rect
                        x="0%"
                        y="0%"
                        width="100%"
                        height="100%"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        opacity="0.4"
                    />

                    {/* 2. THE NET: Exact Center */}
                    <line
                        x1="0%"
                        y1="50%"
                        x2="100%"
                        y2="50%"
                        stroke="white"
                        strokeWidth="2"
                        opacity="0.4"
                        strokeDasharray="4"
                    />

                    {/* 3. SINGLES SIDELINES: 7.5% from edges */}
                    <line
                        x1="7.5%"
                        y1="0%"
                        x2="7.5%"
                        y2="100%"
                        stroke="white"
                        strokeWidth="2"
                        opacity="0.4"
                    />
                    <line
                        x1="92.5%"
                        y1="0%"
                        x2="92.5%"
                        y2="100%"
                        stroke="white"
                        strokeWidth="2"
                        opacity="0.4"
                    />

                    {/* 4. BACK DOUBLES SERVICE LINES: 5.7% from top/bottom */}
                    <line
                        x1="0%"
                        y1="5.7%"
                        x2="100%"
                        y2="5.7%"
                        stroke="white"
                        strokeWidth="2"
                        opacity="0.4"
                    />
                    <line
                        x1="0%"
                        y1="94.3%"
                        x2="100%"
                        y2="94.3%"
                        stroke="white"
                        strokeWidth="2"
                        opacity="0.4"
                    />

                    {/* 5. SHORT SERVICE LINES: 35.2% from top/bottom (approx 1.98m from net) */}
                    <line
                        x1="0%"
                        y1="35.2%"
                        x2="100%"
                        y2="35.2%"
                        stroke="white"
                        strokeWidth="2"
                        opacity="0.4"
                    />
                    <line
                        x1="0%"
                        y1="64.8%"
                        x2="100%"
                        y2="64.8%"
                        stroke="white"
                        strokeWidth="2"
                        opacity="0.4"
                    />

                    {/* 6. CENTER LINE: Splits Left/Right Service Courts 
      Crucial Fix: It goes from the Short Service Line to the Back Boundary. 
      It does NOT cross the net. */}

                    {/* Top Court Center Line */}
                    <line
                        x1="50%"
                        y1="0%"
                        x2="50%"
                        y2="35.2%"
                        stroke="white"
                        strokeWidth="2"
                        opacity="0.4"
                    />

                    {/* Bottom Court Center Line */}
                    <line
                        x1="50%"
                        y1="64.8%"
                        x2="50%"
                        y2="100%"
                        stroke="white"
                        strokeWidth="2"
                        opacity="0.4"
                    />
                </svg>

                {/* Heatmap points */}
                {shotData.map((shot, index) => (
                    <motion.div
                        key={index}
                        className="absolute"
                        style={{
                            left: `${shot.x}%`,
                            top: `${shot.y}%`,
                            transform: "translate(-50%, -50%)",
                        }}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: shot.intensity }}
                        transition={{ delay: index * 0.05, duration: 0.5 }}
                    >
                        {/* Glow effect */}
                        <div
                            className="w-12 h-12 rounded-full blur-xl"
                            style={{
                                background: `radial-gradient(circle, rgba(168, 85, 247, ${shot.intensity}) 0%, transparent 70%)`,
                            }}
                        />
                        {/* Center dot */}
                        <div
                            className="absolute top-1/2 left-1/2 w-2 h-2 rounded-full bg-purple-400 -translate-x-1/2 -translate-y-1/2"
                            style={{ opacity: shot.intensity }}
                        />
                    </motion.div>
                ))}
            </div>

            {/* Legend */}
            <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
                <span>Less frequent</span>
                <div className="flex-1 mx-4 h-2 rounded-full bg-gradient-to-r from-purple-900/30 via-purple-600/50 to-purple-400" />
                <span>More frequent</span>
            </div>

            {/* Total shots */}
            <div className="mt-4 text-center">
                <p className="text-2xl text-white">{shotData.length}</p>
                <p className="text-sm text-gray-400">Total Shots Tracked</p>
            </div>
        </div>
    );
}
