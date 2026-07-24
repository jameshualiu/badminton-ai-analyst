import { useRef, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import { shotColor } from "../../../utils/shotUtils";
import { fmtTime } from "../../../utils/timeUtils";
import type { CurrentTimeStore } from "../hooks/useCurrentTimeStore";
import type { AnalysisShot } from "../types";

type Props = {
  duration: number;
  shotEvents: AnalysisShot[];
  fps: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  store: CurrentTimeStore;
};

// Isolated from AnalysisPage so the 60Hz currentTime updates during playback
// only re-render this scrub bar, not the shot log / rally log / stat tiles.
export function VideoTimeline({ duration, shotEvents, fps, videoRef, store }: Props) {
  const currentTime = useSyncExternalStore(store.subscribe, store.get);
  const tlRef = useRef<HTMLDivElement | null>(null);
  const pct = duration > 0 ? Math.min(currentTime / duration, 1) : 0;

  const handleTlMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tlRef.current || !videoRef.current || duration <= 0) return;
    const seek = (clientX: number) => {
      const rect = tlRef.current!.getBoundingClientRect();
      const p = Math.max(0, Math.min((clientX - rect.left) / rect.width, 1));
      videoRef.current!.currentTime = p * duration;
      store.set(p * duration);
    };
    seek(e.clientX);
    const onMove = (ev: MouseEvent) => seek(ev.clientX);
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div className="p-4 px-5 pb-5 border-t border-border shrink-0">
      <div
        className="relative h-8 flex items-center cursor-pointer select-none"
        ref={tlRef}
        onMouseDown={handleTlMouseDown}
      >
        <div className="w-full h-[3px] bg-primary/10 rounded-full">
          <div
            className="h-full bg-primary rounded-full"
            style={{ width: `${pct * 100}%` }}
          />
        </div>
        {shotEvents.map((ev, i) => {
          const evPct = duration > 0 ? (ev.frame / fps / duration) * 100 : 0;
          const c = shotColor(ev.type);
          return (
            <div
              key={i}
              className="absolute -translate-x-1/2 w-[6px] h-[6px] rounded-full border border-[#080c10] transition-transform hover:scale-[1.8]"
              style={{ left: `${evPct}%`, background: c, boxShadow: `0 0 8px ${c}80` }}
            />
          );
        })}
        <div
          className="absolute w-[13px] h-[13px] rounded-full bg-white border-2 border-primary -translate-x-1/2 pointer-events-none shadow-md"
          style={{ left: `${pct * 100}%` }}
        />
      </div>
      <div className="flex justify-between mt-2">
        <span className="text-[12px] text-primary font-semibold tabular-nums">
          {fmtTime(currentTime)}
        </span>
        <span className="text-[12px] text-slate-500 dark:text-slate-400 font-light tabular-nums">
          {fmtTime(duration)}
        </span>
      </div>
    </div>
  );
}
