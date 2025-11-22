import { VideoCard } from "./VideoCard";
import { Plus } from "lucide-react";

interface DashboardProps {
    onVideoSelect: (videoId: string) => void;
}

const mockVideos = [
    {
        id: "1",
        title: "Finals Match - Court 1",
        date: "2025-11-20",
        duration: "45:32",
        thumbnail:
            "https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=800",
        shots: 342,
        accuracy: 87,
    },
    {
        id: "2",
        title: "Training Session",
        date: "2025-11-19",
        duration: "32:18",
        thumbnail:
            "https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=800",
        shots: 256,
        accuracy: 91,
    },
    {
        id: "3",
        title: "Doubles Match Analysis",
        date: "2025-11-18",
        duration: "52:45",
        thumbnail:
            "https://images.unsplash.com/photo-1632657446577-eae9dcaee988?w=800",
        shots: 423,
        accuracy: 84,
    },
    {
        id: "4",
        title: "Singles Practice",
        date: "2025-11-17",
        duration: "28:12",
        thumbnail:
            "https://images.unsplash.com/photo-1611398751053-3a5a5b0a8d7f?w=800",
        shots: 198,
        accuracy: 89,
    },
];

export function Dashboard({ onVideoSelect }: DashboardProps) {
    return (
        <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="flex items-center justify-between mb-12">
                <div>
                    <h2 className="text-4xl mb-2">Your Analyses</h2>
                    <p className="text-gray-400">
                        Review past video analyses and insights
                    </p>
                </div>

                <button className="px-6 py-3 bg-gradient-to-br from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 rounded-full transition-all flex items-center gap-2 shadow-lg shadow-purple-500/50 hover:shadow-s hover:shadow-purple-500/60">
                    <Plus className="w-5 h-5" />
                    Upload Video
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {mockVideos.map((video) => (
                    <VideoCard
                        key={video.id}
                        video={video}
                        onClick={() => onVideoSelect(video.id)}
                    />
                ))}
            </div>
        </div>
    );
}
