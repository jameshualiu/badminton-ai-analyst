import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import { shotColor } from "../../../utils/shotUtils";
import { fmtTime } from "../../../utils/timeUtils";
import type { CurrentTimeStore } from "../hooks/useCurrentTimeStore";
import type { AnalysisShot, VideoStatus } from "../types";

type Props = {
  shotEvents: AnalysisShot[];
  fps: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  status: VideoStatus;
  store: CurrentTimeStore;
};

// Isolated from AnalysisPage so the 60Hz currentTime updates during playback
// only re-render this list's active-row highlight, not the rest of the page.
export function ShotLog({ shotEvents, fps, videoRef, status, store }: Props) {
  const currentTime = useSyncExternalStore(store.subscribe, store.get);
  const shotLogRef = useRef<HTMLDivElement | null>(null);
  const activeRowRef = useRef<HTMLDivElement | null>(null);

  const currentShotIdx = useMemo(() => {
    if (!shotEvents.length || fps === 0) return -1;
    const currentFrame = Math.round(currentTime * fps);
    let idx = -1;
    for (let i = 0; i < shotEvents.length; i++) {
      if (shotEvents[i].frame <= currentFrame) idx = i;
      else break;
    }
    return idx;
  }, [shotEvents, currentTime, fps]);

  useEffect(() => {
    if (currentShotIdx >= 0 && activeRowRef.current && shotLogRef.current) {
      activeRowRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [currentShotIdx]);

  return (
    <div className="dark:bg-card bg-white border border-border rounded-xl flex flex-col overflow-hidden">
      <div className="py-2.5 px-4 border-b border-border flex items-center justify-between shrink-0">
        <span className="text-[10px] font-bold tracking-[1.2px] uppercase text-slate-500 dark:text-slate-400">
          Shot Log
        </span>
        <span className="text-[11px] text-primary font-bold">
          {shotEvents.length}
        </span>
      </div>
      <div
        ref={shotLogRef}
        className="overflow-y-auto flex-1 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:bg-primary/20 [&::-webkit-scrollbar-thumb]:rounded-full"
      >
        {shotEvents.length > 0 ? (
          shotEvents.map((ev, i) => {
            const isActive = i === currentShotIdx;
            const color = shotColor(ev.type);
            return (
              <div
                key={i}
                ref={isActive ? activeRowRef : null}
                className={`flex items-center gap-2 py-2 px-3 border-b border-slate-100 dark:border-border/40 cursor-pointer transition-colors ${
                  isActive
                    ? "bg-primary/10 border-l-2 border-l-primary"
                    : "hover:bg-primary/5"
                }`}
                onClick={() => {
                  if (videoRef.current)
                    videoRef.current.currentTime = ev.frame / fps;
                }}
              >
                <span
                  className={`text-[11px] font-bold w-8 shrink-0 tabular-nums ${isActive ? "text-primary" : "text-slate-500 dark:text-slate-400"}`}
                >
                  {fmtTime(ev.frame / fps)}
                </span>
                <div
                  className="w-1.5 h-1.5 rounded-full shrink-0 transition-transform"
                  style={{
                    background: color,
                    boxShadow: isActive ? `0 0 6px ${color}` : "none",
                    transform: isActive ? "scale(1.4)" : "scale(1)",
                  }}
                />
                <span
                  className={`text-[12px] font-semibold flex-1 truncate ${isActive ? "text-foreground" : "text-slate-500 dark:text-slate-400"}`}
                  style={isActive ? { color } : undefined}
                >
                  {ev.type}
                </span>
                {ev.location_m && (
                  <span className="text-[9px] text-slate-400 dark:text-slate-500 tabular-nums">
                    {ev.location_m[0].toFixed(1)},{ev.location_m[1].toFixed(1)}
                  </span>
                )}
              </div>
            );
          })
        ) : (
          <div className="flex items-center justify-center p-8 text-[12px] text-slate-400 dark:text-slate-500">
            {status === "done" ? "No shots detected" : "Processing…"}
          </div>
        )}
      </div>
    </div>
  );
}
