import { motion } from "motion/react";
import type { AnalysisData, AnalysisShot } from "../types";
import { shotColor } from "../../../utils/shotUtils";

// 57 edges connecting the 35-point grid, from CourtDetect.draw_court's c_edges
const COURT_EDGES: [number, number][] = [
  [0, 1],
  [0, 5],
  [1, 2],
  [1, 6],
  [2, 3],
  [2, 7],
  [3, 4],
  [3, 8],
  [4, 9],
  [5, 6],
  [5, 10],
  [6, 7],
  [6, 11],
  [7, 8],
  [7, 12],
  [8, 9],
  [8, 13],
  [9, 14],
  [10, 11],
  [10, 15],
  [11, 12],
  [11, 16],
  [12, 13],
  [12, 17],
  [13, 14],
  [13, 18],
  [14, 19],
  [15, 16],
  [15, 20],
  [16, 17],
  [16, 21],
  [17, 18],
  [17, 22],
  [18, 19],
  [18, 23],
  [19, 24],
  [20, 21],
  [20, 25],
  [21, 22],
  [21, 26],
  [22, 23],
  [22, 27],
  [23, 24],
  [23, 28],
  [24, 29],
  [25, 26],
  [25, 30],
  [26, 27],
  [26, 31],
  [27, 28],
  [27, 32],
  [28, 29],
  [28, 33],
  [29, 34],
  [30, 31],
  [31, 32],
  [32, 33],
  [33, 34],
];

type CourtGeometry = NonNullable<AnalysisData["geometry"]>;

interface ShotHeatmapProps {
  shots?: AnalysisShot[];
  geometry?: CourtGeometry | null;
}

const fallbackShotData = [
  { x: 20, y: 15, intensity: 0.9, type: "Clear" },
  { x: 25, y: 20, intensity: 0.7, type: "Drop" },
  { x: 22, y: 18, intensity: 0.8, type: "Net" },
  { x: 80, y: 85, intensity: 0.9, type: "Smash" },
  { x: 78, y: 88, intensity: 0.6, type: "Drive" },
  { x: 82, y: 83, intensity: 0.8, type: "Lob" },
  { x: 50, y: 45, intensity: 0.5, type: "Clear" },
  { x: 48, y: 50, intensity: 0.6, type: "Drop" },
];

function projectToPercent(
  pts: [number, number][],
  kp6: [number, number][],
): { x: number; y: number }[] {
  const xs = kp6.map((p) => p[0]);
  const ys = kp6.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  return pts.map(([x, y]) => ({
    x: ((x - minX) / rangeX) * 100,
    y: ((y - minY) / rangeY) * 100,
  }));
}

export function ShotHeatmap({ shots = [], geometry }: ShotHeatmapProps) {
  const validShots = Array.isArray(shots) ? shots : [];
  const mappedShots =
    validShots.length > 0
      ? validShots.map((shot) => {
          let xPos = 50;
          let yPos = 50;

          if (shot.location_m) {
            xPos = Math.max(0, Math.min(100, (shot.location_m[0] / 6.1) * 100));
            yPos = Math.max(
              0,
              Math.min(100, (shot.location_m[1] / 13.4) * 100),
            );
          }

          return { x: xPos, y: yPos, intensity: 0.8, type: shot.type };
        })
      : fallbackShotData;

  const kp35 = geometry?.court_keypoints_35 ?? null;
  const kp6 = geometry?.court_keypoints_6 ?? null;
  const courtPoints =
    kp35 && kp6
      ? projectToPercent(kp35 as [number, number][], kp6 as [number, number][])
      : null;

  return (
    <div className="bg-gradient-to-br from-purple-950/20 to-black border border-purple-900/20 rounded-2xl p-6 h-full flex flex-col">
      <h3 className="mb-4 text-gray-400 font-medium">Shot Heatmap</h3>

      <div className="relative aspect-[44/88] bg-gradient-to-br from-green-950/30 to-green-900/20 rounded-lg border-2 border-white/20 overflow-hidden mx-auto h-full max-h-[400px]">
        <svg
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="none"
        >
          {courtPoints ? (
            COURT_EDGES.map(([a, b], i) => (
              <line
                key={i}
                x1={`${courtPoints[a].x}%`}
                y1={`${courtPoints[a].y}%`}
                x2={`${courtPoints[b].x}%`}
                y2={`${courtPoints[b].y}%`}
                stroke="white"
                strokeWidth="1.5"
                opacity="0.4"
              />
            ))
          ) : (
            <>
              {/* Outer Boundary */}
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
              {/* Net */}
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
              {/* Singles Sidelines */}
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
              {/* Doubles Back Service Line */}
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
              {/* Short Service Line */}
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
              {/* Center Line */}
              <line
                x1="50%"
                y1="0%"
                x2="50%"
                y2="35.2%"
                stroke="white"
                strokeWidth="2"
                opacity="0.4"
              />
              <line
                x1="50%"
                y1="64.8%"
                x2="50%"
                y2="100%"
                stroke="white"
                strokeWidth="2"
                opacity="0.4"
              />
            </>
          )}
        </svg>

        {mappedShots.map((shot, index) => (
          <motion.div
            key={`${shot.x}-${shot.y}-${index}`}
            className="absolute"
            style={{
              left: `${shot.x}%`,
              top: `${shot.y}%`,
              transform: "translate(-50%, -50%)",
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: shot.intensity }}
            transition={{ delay: Math.min(index * 0.05, 2), duration: 0.5 }}
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: shotColor(shot.type),
                boxShadow: `0 0 8px ${shotColor(shot.type)}80`,
              }}
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
        <p className="text-2xl text-white font-semibold">
          {mappedShots.length}
        </p>
        <p className="text-sm text-gray-400">Total Shots Tracked</p>
      </div>
    </div>
  );
}
