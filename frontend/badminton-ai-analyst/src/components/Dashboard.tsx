import { useState, useEffect } from "react";
import { VideoCard } from "./VideoCard";
import { Plus } from "lucide-react";
import { UploadModal } from "./UploadModal";

// Firebase (REALTIME listener)
import { collection, addDoc, onSnapshot } from "firebase/firestore";
import { db } from "../../firebaseConfig"; // adjust if needed

interface DashboardProps {
    onVideoSelect: (videoId: string) => void;
}

export function Dashboard({ onVideoSelect }: DashboardProps) {
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [videos, setVideos] = useState<any[]>([]);

    // 🔥 Realtime listener for Firestore updates
    useEffect(() => {
        const colRef = collection(db, "videos");

        const unsubscribe = onSnapshot(colRef, (snapshot) => {
            const items: any[] = snapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));

            // Sort by date DESC (newest first)
            items.sort((a, b) => {
                const dateA = new Date(a.date || 0).getTime();
                const dateB = new Date(b.date || 0).getTime();
                return dateB - dateA;
            });

            setVideos(items);
        });

        return () => unsubscribe();
    }, []);

    // 🔥 Upload handler (send to backend → save to Firestore)
    const handleUpload = async (file: File) => {
        try {
            const formData = new FormData();
            formData.append("video_file", file);

            const res = await fetch("http://localhost:8000/analyze", {
                method: "POST",
                body: formData,
            });

            if (!res.ok) {
                throw new Error(`Upload failed: ${res.statusText}`);
            }

            const data = await res.json();
            console.log("Analysis result:", data);

            // Build Firestore document
            const card = {
                title: file.name,
                date: new Date().toISOString(), // store full ISO string
                duration: data?.duration ?? "Unknown",
                thumbnail:
                    data?.thumbnail ??
                    "https://placehold.co/600x400?text=Generating+Preview...",
                shots: data?.total_shuttle_detections ?? 0,
                accuracy: 0,
                analysisId: data.analysisId ?? null,
            };

            // Save card to Firestore
            await addDoc(collection(db, "videos"), card);

            alert("Video analyzed and card saved!");
        } catch (err) {
            console.error("Upload error:", err);
            alert("Error uploading video.");
        }
    };

    return (
        <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="flex items-center justify-between mb-12">
                <div>
                    <h2 className="font-[Poppins] text-4xl mb-2">
                        Your Analyses
                    </h2>
                    <p className="text-gray-400">
                        Review past video analyses and insights
                    </p>
                </div>

                <button
                    onClick={() => setIsUploadModalOpen(true)}
                    className="font-[Poppins] px-6 py-3 bg-gradient-to-br from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 rounded-full transition-all flex items-center gap-2 shadow-lg shadow-purple-500/50 hover:shadow-purple-500/60"
                >
                    <Plus className="w-5 h-5" />
                    Upload Video
                </button>
            </div>

            {/* FIRESTORE LIVE GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {videos.map((video) => (
                    <VideoCard
                        key={video.id}
                        video={video}
                        onClick={() => onVideoSelect(video.id)}
                    />
                ))}
            </div>

            <UploadModal
                open={isUploadModalOpen}
                onOpenChange={setIsUploadModalOpen}
                onUpload={handleUpload}
            />
        </div>
    );
}
