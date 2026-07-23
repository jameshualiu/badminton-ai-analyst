import { useMemo, useState } from "react";
import { shotColor, SHOT_COLORS } from "../../../utils/shotUtils";
import type { AnalysisShot } from "../types";
import { CourtHeatmap } from "./CourtHeatmap";

export function ShotStatsTab({
  shotEvents,
  totalShots,
  status,
}: {
  shotEvents: AnalysisShot[];
  totalShots: number | null | undefined;
  status: string;
}) {
  const [selectedType, setSelectedType] = useState("all");

  const shotTypes = useMemo(
    () => Object.keys(SHOT_COLORS).filter((t) => t !== "Unknown"),
    [],
  );

  const shotCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    shotEvents.forEach((s) => {
      counts[s.type] = (counts[s.type] ?? 0) + 1;
    });
    return counts;
  }, [shotEvents]);

  const sortedTypes = useMemo(
    () =>
      Object.entries(shotCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([t]) => t),
    [shotCounts],
  );

  const maxCount = sortedTypes.length
    ? (shotCounts[sortedTypes[0]] ?? 1)
    : 1;

  const transitions = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (let i = 0; i < shotEvents.length - 1; i++) {
      const from = shotEvents[i].type;
      const to = shotEvents[i + 1].type;
      if (!map[from]) map[from] = {};
      map[from][to] = (map[from][to] ?? 0) + 1;
    }
    return map;
  }, [shotEvents]);

  const topTransitions = useMemo(() => {
    return sortedTypes.slice(0, 4).map((from) => {
      const toMap = transitions[from] ?? {};
      const tos = Object.entries(toMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);
      const total = tos.reduce((s, [, n]) => s + n, 0);
      return {
        from,
        tos: tos.map(([type, count]) => ({
          type,
          count,
          pct: total > 0 ? Math.round((count / total) * 100) : 0,
        })),
      };
    });
  }, [sortedTypes, transitions]);

  const empty = shotEvents.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Pill filter */}
      <div className="flex flex-wrap gap-2">
        {["all", ...shotTypes].map((type) => {
          const active = selectedType === type;
          const color = type === "all" ? "#3B82F6" : shotColor(type);
          return (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className="px-3 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer"
              style={
                active
                  ? {
                      borderColor: color,
                      color,
                      background: `${color}18`,
                    }
                  : {
                      borderColor: "rgba(255,255,255,0.10)",
                      color: "rgba(147,197,253,0.55)",
                      background: "transparent",
                    }
              }
            >
              {type === "all" ? "All shots" : type}
            </button>
          );
        })}
      </div>

      {/* Heatmap + distribution */}
      <div className="grid grid-cols-2 gap-4">
        {/* Heatmap */}
        <div className="dark:bg-card bg-white border border-border rounded-xl p-5">
          <div className="text-[10px] font-bold tracking-[1px] uppercase text-slate-500 dark:text-slate-400 mb-4">
            Shot Heatmap
          </div>
          {empty ? (
            <div className="text-[12px] text-slate-400 dark:text-slate-500">
              {status === "done" ? "No position data" : "Processing…"}
            </div>
          ) : (
            <div className="flex gap-4 items-start">
              {/* SVG court */}
              <div className="shrink-0 w-[130px]">
                <CourtHeatmap shots={shotEvents} selectedType={selectedType} />
              </div>
              {/* Legend + bars */}
              <div className="flex flex-col gap-2 flex-1 justify-center">
                {sortedTypes.map((type) => {
                  const count = shotCounts[type] ?? 0;
                  const pct = totalShots ? (count / totalShots) * 100 : 0;
                  const color = shotColor(type);
                  const faded =
                    selectedType !== "all" && selectedType !== type;
                  return (
                    <div
                      key={type}
                      className="flex items-center gap-2 transition-opacity"
                      style={{ opacity: faded ? 0.22 : 1 }}
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ background: color }}
                      />
                      <span
                        className="text-[11px] font-medium w-9 shrink-0"
                        style={{ color: "rgba(147,197,253,0.65)" }}
                      >
                        {type}
                      </span>
                      <div
                        className="flex-1 h-1 rounded-full overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.06)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${(count / maxCount) * 100}%`,
                            background: color,
                          }}
                        />
                      </div>
                      <span className="text-[12px] font-bold tabular-nums text-foreground w-5 text-right">
                        {count}
                      </span>
                      <span
                        className="text-[10px] tabular-nums w-8 text-right"
                        style={{ color: "rgba(147,197,253,0.35)" }}
                      >
                        {Math.round(pct)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Shot count tiles + insight */}
        <div className="dark:bg-card bg-white border border-border rounded-xl p-5">
          <div className="text-[10px] font-bold tracking-[1px] uppercase text-slate-500 dark:text-slate-400 mb-4">
            Shot Breakdown
          </div>
          {empty ? (
            <div className="text-[12px] text-slate-400 dark:text-slate-500">
              {status === "done" ? "No data" : "Processing…"}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2 mb-1">
                <div
                  className="rounded-lg p-3"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="text-[9px] font-bold uppercase tracking-[.8px] text-slate-500 dark:text-slate-400 mb-1">
                    Total
                  </div>
                  <div className="text-[22px] font-bold tracking-tight text-primary tabular-nums">
                    {totalShots ?? "—"}
                  </div>
                </div>
                <div
                  className="rounded-lg p-3"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="text-[9px] font-bold uppercase tracking-[.8px] text-slate-500 dark:text-slate-400 mb-1">
                    Top shot
                  </div>
                  <div
                    className="text-[14px] font-bold"
                    style={{ color: sortedTypes[0] ? shotColor(sortedTypes[0]) : undefined }}
                  >
                    {sortedTypes[0] ?? "—"}
                  </div>
                </div>
                <div
                  className="rounded-lg p-3"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="text-[9px] font-bold uppercase tracking-[.8px] text-slate-500 dark:text-slate-400 mb-1">
                    Types
                  </div>
                  <div className="text-[22px] font-bold tracking-tight tabular-nums">
                    {sortedTypes.length}
                  </div>
                </div>
              </div>

              {/* Per-type rows */}
              <div className="flex flex-col gap-2.5 mt-1">
                {sortedTypes.map((type) => {
                  const count = shotCounts[type] ?? 0;
                  const pct = totalShots ? (count / totalShots) * 100 : 0;
                  const color = shotColor(type);
                  const faded =
                    selectedType !== "all" && selectedType !== type;
                  return (
                    <div
                      key={type}
                      className="transition-opacity"
                      style={{ opacity: faded ? 0.22 : 1 }}
                    >
                      <div className="flex justify-between mb-1">
                        <span className="text-[11px] flex items-center gap-1.5" style={{ color: "rgba(147,197,253,0.65)" }}>
                          <span className="w-1.5 h-1.5 rounded-full shrink-0 inline-block" style={{ background: color }} />
                          {type}
                        </span>
                        <span className="text-[11px] font-bold tabular-nums">{count}</span>
                      </div>
                      <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transition tendencies */}
      {topTransitions.length > 0 && (
        <div className="dark:bg-card bg-white border border-border rounded-xl p-5">
          <div className="text-[10px] font-bold tracking-[1px] uppercase text-slate-500 dark:text-slate-400 mb-4">
            Shot Transition Tendencies
          </div>
          <div className="grid grid-cols-2 gap-x-10 gap-y-0">
            {topTransitions.map(({ from, tos }) => (
              <div
                key={from}
                className="flex items-start gap-3 py-2.5 border-t border-border first:border-t-0"
              >
                <div className="flex items-center gap-1.5 w-14 shrink-0 pt-0.5">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: shotColor(from) }}
                  />
                  <span className="text-[11px] font-medium" style={{ color: "rgba(147,197,253,0.65)" }}>
                    {from}
                  </span>
                </div>
                <span className="text-[11px] pt-0.5" style={{ color: "rgba(147,197,253,0.3)" }}>→</span>
                <div className="flex flex-wrap gap-1.5">
                  {tos.map(({ type, pct }, i) => (
                    <span
                      key={type}
                      className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold border"
                      style={
                        i === 0
                          ? {
                              background: `${shotColor(type)}12`,
                              borderColor: `${shotColor(type)}35`,
                              color: shotColor(type),
                            }
                          : {
                              background: "rgba(255,255,255,0.03)",
                              borderColor: "rgba(255,255,255,0.08)",
                              color: "rgba(147,197,253,0.55)",
                            }
                      }
                    >
                      <span
                        className="w-1 h-1 rounded-full"
                        style={{ background: shotColor(type) }}
                      />
                      {type}
                      <span style={{ color: "rgba(147,197,253,0.35)" }}>{pct}%</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
