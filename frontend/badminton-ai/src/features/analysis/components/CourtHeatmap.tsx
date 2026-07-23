import { shotColor } from "../../../utils/shotUtils";
import type { AnalysisShot } from "../types";

// Court SVG dimensions (matches the heatmap SVG)
const SVG_COURT = { x: 16, y: 20, w: 98, h: 232 };
const COURT_M = { w: 6.1, h: 13.4 };

// Maps location_m [x, y] → SVG coordinate
function toSvgCoord(loc: [number, number]): { cx: number; cy: number } {
  return {
    cx: SVG_COURT.x + (loc[0] / COURT_M.w) * SVG_COURT.w,
    cy: SVG_COURT.y + (loc[1] / COURT_M.h) * SVG_COURT.h,
  };
}

export function CourtHeatmap({
  shots,
  selectedType,
}: {
  shots: AnalysisShot[];
  selectedType: string;
}) {
  const filtered = selectedType === "all"
    ? shots
    : shots.filter((s) => s.type === selectedType);

  const positioned = filtered.filter((s) => s.location_m !== null) as (AnalysisShot & {
    location_m: [number, number];
  })[];

  return (
    <svg
      viewBox="0 0 130 272"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full block"
      style={{ maxWidth: 160 }}
    >
      {/* Dark surround */}
      <rect width="130" height="272" fill="rgba(8,16,28,0.9)" rx="4" />
      {/* Court surface — green */}
      <rect x="16" y="20" width="98" height="232" fill="rgba(22,78,46,0.8)" />

      {/* Court lines */}
      {/* Outer doubles boundary */}
      <rect x="16" y="20" width="98" height="232" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.2" />
      {/* Singles sidelines — full length */}
      <line x1="23" y1="20" x2="23" y2="252" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" />
      <line x1="107" y1="20" x2="107" y2="252" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" />
      {/* Long service lines (doubles back) */}
      <line x1="16" y1="32" x2="114" y2="32" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" />
      <line x1="16" y1="240" x2="114" y2="240" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" />
      {/* Short service lines */}
      <line x1="16" y1="105" x2="114" y2="105" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" />
      <line x1="16" y1="167" x2="114" y2="167" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" />
      {/* Centre service lines — one per half, not crossing net */}
      <line x1="65" y1="32" x2="65" y2="105" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" />
      <line x1="65" y1="167" x2="65" y2="240" stroke="rgba(255,255,255,0.55)" strokeWidth="0.9" />
      {/* Net — on top */}
      <line x1="16" y1="136" x2="114" y2="136" stroke="rgba(255,255,255,0.95)" strokeWidth="2" />
      <text x="117" y="139" fontSize="5.5" fill="rgba(255,255,255,0.3)" fontFamily="sans-serif">NET</text>

      {/* Shot dots */}
      {positioned.length === 0 && (
        <text x="65" y="140" textAnchor="middle" fontSize="7" fill="rgba(255,255,255,0.2)" fontFamily="sans-serif">
          no position data
        </text>
      )}
      {positioned.map((s, i) => {
        const { cx, cy } = toSvgCoord(s.location_m);
        const color = shotColor(s.type);
        const fade = selectedType === "all" ? 0.75 : 0.85;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r="3.5"
            fill={color}
            opacity={fade}
          />
        );
      })}
    </svg>
  );
}
