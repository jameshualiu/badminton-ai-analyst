import { motion } from "motion/react";
import type { AnalysisShot } from "../types";

interface ShotHeatmapProps {
    shots?: AnalysisShot[];
}

const fallbackShotData = [
    { x: 20, y: 15, intensity: 0.9 },
    { x: 25, y: 20, intensity: 0.7 },
    { x: 22, y: 18, intensity: 0.8 },
    { x: 80, y: 85, intensity: 0.9 },
    { x: 78, y: 88, intensity: 0.6 },
    { x: 82, y: 83, intensity: 0.8 },
    { x: 50, y: 45, intensity: 0.5 },
    { x: 48, y: 50, intensity: 0.6 },
];

export function ShotHeatmap({ shots = [] }: ShotHeatmapProps) {
    const mappedShots =
        shots.length > 0
            ? shots.map((shot) => {
                  let xPos = 50;
                  let yPos = 50;
                  
                  if (shot.location_m) {
                      // Map standard court size (6.1m x 13.4m) to 0-100%
                      // Note: We clamp the values just in case tracking puts the ball out of bounds
                      xPos = Math.max(0, Math.min(100, (shot.location_m[0] / 6.1) * 100));
                      yPos = Math.max(0, Math.min(100, (shot.location_m[1] / 13.4) * 100));
                  } else if (shot.location_px) {
                      // If homography failed, we can try to use pixel coords if resolution is known, 
                      // but without resolution context it's hard. Let's just center it for now.
                      xPos = 50;
                      yPos = 50;
                  }

                  return {
                      x: xPos,
                      y: yPos,
                      intensity: 0.8,
                  };
              })
            : fallbackShotData;

    return (
        <div className="bg-gradient-to-br from-purple-950/20 to-black border border-purple-900/20 rounded-2xl p-6 h-full flex flex-col">
            <h3 className="mb-4 text-gray-400 font-medium">Shot Heatmap</h3>

            <div className="relative aspect-[44/88] bg-gradient-to-br from-green-950/30 to-green-900/20 rounded-lg border-2 border-white/20 overflow-hidden mx-auto h-full max-h-[400px]">
                {/* Court Lines */}
                <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
                    {/* Outer Boundary */}
                    <rect x="0%" y="0%" width="100%" height="100%" fill="none" stroke="white" strokeWidth="2" opacity="0.4" />
                    {/* Net */}
                    <line x1="0%" y1="50%" x2="100%" y2="50%" stroke="white" strokeWidth="2" opacity="0.4" strokeDasharray="4" />
                    {/* Singles Sidelines */}
                    <line x1="7.5%" y1="0%" x2="7.5%" y2="100%" stroke="white" strokeWidth="2" opacity="0.4" />
                    <line x1="92.5%" y1="0%" x2="92.5%" y2="100%" stroke="white" strokeWidth="2" opacity="0.4" />
                    {/* Doubles Back Service Line */}
                    <line x1="0%" y1="5.7%" x2="100%" y2="5.7%" stroke="white" strokeWidth="2" opacity="0.4" />
                    <line x1="0%" y1="94.3%" x2="100%" y2="94.3%" stroke="white" strokeWidth="2" opacity="0.4" />
                    {/* Short Service Line */}
                    <line x1="0%" y1="35.2%" x2="100%" y2="35.2%" stroke="white" strokeWidth="2" opacity="0.4" />
                    <line x1="0%" y1="64.8%" x2="100%" y2="64.8%" stroke="white" strokeWidth="2" opacity="0.4" />
                    {/* Center Line */}
                    <line x1="50%" y1="0%" x2="50%" y2="35.2%" stroke="white" strokeWidth="2" opacity="0.4" />
                    <line x1="50%" y1="64.8%" x2="50%" y2="100%" stroke="white" strokeWidth="2" opacity="0.4" />
                </svg>

                {mappedShots.map((shot, index) => (
                    <motion.div
                        key={`${shot.x}-${shot.y}-${index}`}
                        className="absolute"
                        style={{ left: `${shot.x}%`, top: `${shot.y}%`, transform: "translate(-50%, -50%)" }}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: shot.intensity }}
                        transition={{ delay: Math.min(index * 0.05, 2), duration: 0.5 }} // Cap delay at 2s
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

            <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
                <span>Less frequent</span>
                <div className="flex-1 mx-4 h-2 rounded-full bg-gradient-to-r from-purple-900/30 via-purple-600/50 to-purple-400" />
                <span>More frequent</span>
            </div>

            <div className="mt-4 text-center">
                <p className="text-2xl text-white font-semibold">{mappedShots.length}</p>
                <p className="text-sm text-gray-400">Total Shots Tracked</p>
            </div>
        </div>
    );
}
