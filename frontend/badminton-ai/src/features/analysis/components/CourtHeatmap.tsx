import { shotColor } from "../../../utils/shotUtils";
import type { AnalysisShot } from "../types";

// Court SVG dimensions (matches the heatmap SVG)
const SVG_COURT = { x: 16, y: 20, w: 98, h: 232 };
const COURT_M = { w: 6.1, h: 13.4 };

// Layout derived from SVG_COURT — badminton court proportions, in px
const SIDE_INSET = 7; // singles sideline inset from the doubles sideline
const LONG_SERVICE_INSET = 12; // doubles long-service line inset from the baseline
const SHORT_SERVICE_INSET = 85; // short-service line inset from the baseline

const LEFT = SVG_COURT.x;
const RIGHT = SVG_COURT.x + SVG_COURT.w;
const TOP = SVG_COURT.y;
const BOTTOM = SVG_COURT.y + SVG_COURT.h;
const SIDE_L = LEFT + SIDE_INSET;
const SIDE_R = RIGHT - SIDE_INSET;
const SVC_LONG_TOP = TOP + LONG_SERVICE_INSET;
const SVC_LONG_BOTTOM = BOTTOM - LONG_SERVICE_INSET;
const SVC_SHORT_TOP = TOP + SHORT_SERVICE_INSET;
const SVC_SHORT_BOTTOM = BOTTOM - SHORT_SERVICE_INSET;
const NET_Y = (TOP + BOTTOM) / 2;
const CENTRE_X = (LEFT + RIGHT) / 2;
const VIEWBOX_W = SVG_COURT.x * 2 + SVG_COURT.w;
const VIEWBOX_H = SVG_COURT.y * 2 + SVG_COURT.h;

// Colors
const SURROUND_FILL = "rgba(8,16,28,0.9)";
const COURT_FILL = "rgba(22,78,46,0.8)";
const LINE_COLOR = "rgba(255,255,255,0.55)";
const LINE_COLOR_STRONG = "rgba(255,255,255,0.85)";
const NET_LINE_COLOR = "rgba(255,255,255,0.95)";
const NET_LABEL_COLOR = "rgba(255,255,255,0.3)";
const EMPTY_STATE_COLOR = "rgba(255,255,255,0.2)";

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
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full block"
      style={{ maxWidth: 160 }}
    >
      {/* Dark surround */}
      <rect width={VIEWBOX_W} height={VIEWBOX_H} fill={SURROUND_FILL} rx="4" />
      {/* Court surface — green */}
      <rect x={LEFT} y={TOP} width={SVG_COURT.w} height={SVG_COURT.h} fill={COURT_FILL} />

      {/* Court lines */}
      {/* Outer doubles boundary */}
      <rect x={LEFT} y={TOP} width={SVG_COURT.w} height={SVG_COURT.h} fill="none" stroke={LINE_COLOR_STRONG} strokeWidth="1.2" />
      {/* Singles sidelines — full length */}
      <line x1={SIDE_L} y1={TOP} x2={SIDE_L} y2={BOTTOM} stroke={LINE_COLOR} strokeWidth="0.9" />
      <line x1={SIDE_R} y1={TOP} x2={SIDE_R} y2={BOTTOM} stroke={LINE_COLOR} strokeWidth="0.9" />
      {/* Long service lines (doubles back) */}
      <line x1={LEFT} y1={SVC_LONG_TOP} x2={RIGHT} y2={SVC_LONG_TOP} stroke={LINE_COLOR} strokeWidth="0.9" />
      <line x1={LEFT} y1={SVC_LONG_BOTTOM} x2={RIGHT} y2={SVC_LONG_BOTTOM} stroke={LINE_COLOR} strokeWidth="0.9" />
      {/* Short service lines */}
      <line x1={LEFT} y1={SVC_SHORT_TOP} x2={RIGHT} y2={SVC_SHORT_TOP} stroke={LINE_COLOR} strokeWidth="0.9" />
      <line x1={LEFT} y1={SVC_SHORT_BOTTOM} x2={RIGHT} y2={SVC_SHORT_BOTTOM} stroke={LINE_COLOR} strokeWidth="0.9" />
      {/* Centre service lines — one per half, not crossing net */}
      <line x1={CENTRE_X} y1={SVC_LONG_TOP} x2={CENTRE_X} y2={SVC_SHORT_TOP} stroke={LINE_COLOR} strokeWidth="0.9" />
      <line x1={CENTRE_X} y1={SVC_SHORT_BOTTOM} x2={CENTRE_X} y2={SVC_LONG_BOTTOM} stroke={LINE_COLOR} strokeWidth="0.9" />
      {/* Net — on top */}
      <line x1={LEFT} y1={NET_Y} x2={RIGHT} y2={NET_Y} stroke={NET_LINE_COLOR} strokeWidth="2" />
      <text x={RIGHT + 3} y={NET_Y + 3} fontSize="5.5" fill={NET_LABEL_COLOR} fontFamily="sans-serif">NET</text>

      {/* Shot dots */}
      {positioned.length === 0 && (
        <text x={CENTRE_X} y={NET_Y + 4} textAnchor="middle" fontSize="7" fill={EMPTY_STATE_COLOR} fontFamily="sans-serif">
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
