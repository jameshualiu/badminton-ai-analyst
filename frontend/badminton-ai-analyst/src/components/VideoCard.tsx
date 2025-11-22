import { motion } from 'motion/react';
import { Clock, Target, TrendingUp } from 'lucide-react';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface Video {
  id: string;
  title: string;
  date: string;
  duration: string;
  thumbnail: string;
  shots: number;
  accuracy: number;
}

interface VideoCardProps {
  video: Video;
  onClick: () => void;
}

export function VideoCard({ video, onClick }: VideoCardProps) {
  return (
    <motion.button
      onClick={onClick}
      className="group relative bg-gradient-to-br from-purple-950/20 to-black border border-purple-900/20 rounded-2xl overflow-hidden text-left hover:border-purple-500/40 transition-all"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden bg-black/40">
        <ImageWithFallback
          src={video.thumbnail}
          alt={video.title}
          className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-105 transition-all duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="mb-2 text-white group-hover:text-purple-400 transition-colors">
          {video.title}
        </h3>
        
        <p className="text-sm text-gray-500 mb-4">{video.date}</p>
        
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1 text-gray-400">
            <Clock className="w-4 h-4" />
            <span>{video.duration}</span>
          </div>
          
          <div className="flex items-center gap-1 text-gray-400">
            <Target className="w-4 h-4" />
            <span>{video.shots}</span>
          </div>
          
          <div className="flex items-center gap-1 text-purple-400">
            <TrendingUp className="w-4 h-4" />
            <span>{video.accuracy}%</span>
          </div>
        </div>
      </div>

      {/* Hover glow effect */}
      <div className="absolute inset-0 bg-purple-600/0 group-hover:bg-purple-600/5 transition-all pointer-events-none" />
    </motion.button>
  );
}
