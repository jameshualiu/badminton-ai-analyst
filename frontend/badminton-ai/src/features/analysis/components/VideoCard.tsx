import { motion } from "motion/react";
import { Clock, Target, Trash2 } from "lucide-react";
import { formatDuration } from "../../../utils/format";
import type { DashboardVideoCard } from "../types";

interface VideoCardProps {
  video: DashboardVideoCard;
  onClick: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}

export function VideoCard({ video, onClick, onDelete }: VideoCardProps) {
  const dateLabel = new Date(video.date).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <motion.button
      onClick={onClick}
      className="group relative bg-card/40 border border-border/40 rounded-2xl overflow-hidden text-left hover:border-primary/40 transition-all backdrop-blur-sm"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      <div className="relative aspect-video overflow-hidden bg-background/40">
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt={video.title}
            className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-105 transition-all duration-500"
            onError={(e) => {
              // hide broken image and let the gradient show
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-background/30" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
      </div>

      <div className="p-4">
        <h3 className="mb-2 text-foreground group-hover:text-primary transition-colors line-clamp-1">
          {video.title}
        </h3>

        <p className="text-sm text-muted-foreground mb-4">{dateLabel}</p>

        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>{video.duration ? formatDuration(video.duration) : "—"}</span>
          </div>

          <div className="flex items-center gap-1 text-muted-foreground">
            <Target className="w-4 h-4" />
            <span>{video.totalShots ?? 0}</span>
          </div>

          {video.status && (
            <div className="ml-auto text-xs px-2 py-1 rounded-full border border-border/40 bg-background/30 text-muted-foreground">
              {video.status}
            </div>
          )}
        </div>
      </div>

      {/* Delete Button Overlay */}
      {onDelete && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
            onDelete(e);
          }}
          className="absolute top-2 right-2 p-2 rounded-full bg-black/40 text-white/60 hover:bg-red-500/80 hover:text-white transition-all opacity-0 group-hover:opacity-100 z-10 cursor-pointer"
          title="Delete Video"
        >
          <Trash2 className="w-4 h-4" />
        </div>
      )}

      <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/5 transition-all pointer-events-none" />
    </motion.button>
  );
}
