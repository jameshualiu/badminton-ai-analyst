import React, { useState, useRef, useEffect } from "react";

export function UploadSection() {
    const [file, setFile] = useState<File | null>(null);
    const [previewURL, setPreviewURL] = useState<string | null>(null);
    const [results, setResults] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    // Refs for direct DOM access (needed for drawing on canvas)
    const mediaRef = useRef<HTMLImageElement | HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const selected = e.target.files?.[0];
        if (!selected) return;

        setFile(selected);
        setResults(null); // Clear previous results on new file

        // Create preview URL for image or video
        const url = URL.createObjectURL(selected);
        setPreviewURL(url);
    }

    async function sendToBackend() {
        if (!file) return;

        setLoading(true);
        setResults(null);

        const formData = new FormData();
        formData.append("video_file", file); // Changed key to match typical backend expectation

        try {
            // Assuming your FastAPI endpoint is /analyze based on previous context
            // If it is /detect, keep it as /detect
            const res = await fetch("http://localhost:8000/analyze", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();
            setResults(data);
        } catch (err) {
            console.error(err);
            alert("Upload failed");
        } finally {
            setLoading(false);
        }
    }

    // --- DRAWING LOGIC ---
    useEffect(() => {
        // Only run if we have results, a media element, and a canvas
        if (!results || !mediaRef.current || !canvasRef.current) return;

        const media = mediaRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animationFrameId: number;

        const render = () => {
            // 1. Match Canvas Size to Media Display Size
            // We use clientWidth/Height because that is the size displayed on screen
            if (
                canvas.width !== media.clientWidth ||
                canvas.height !== media.clientHeight
            ) {
                canvas.width = media.clientWidth;
                canvas.height = media.clientHeight;
            }

            // 2. Clear previous frame
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // 3. Determine current data based on file type
            let currentBoxes: any[] = [];

            if (file?.type.startsWith("video")) {
                // VIDEO LOGIC: Sync with current time
                const video = media as HTMLVideoElement;
                if (video.paused || video.ended) {
                    // Optional: continue loop or pause it.
                    // Keeping it running ensures boxes redraw if window resizes while paused.
                }

                // Calculate Frame Number (Assuming ~30fps or backend provides specific frame mapping)
                // If your backend returns a list of frames, find the one matching current time
                const FPS = 30;
                const currentFrameIdx = Math.floor(video.currentTime * FPS);

                // Look inside the analysis_log from backend
                const frameData = results.analysis_log?.find(
                    (f: any) => f.frame === currentFrameIdx
                );

                // Add shuttle if detected
                if (
                    frameData &&
                    frameData.shuttle_pos &&
                    frameData.is_detected
                ) {
                    // Depending on Roboflow format, predictions might be a list or single object
                    // Adapting to list for robustness
                    const preds = Array.isArray(frameData.shuttle_pos)
                        ? frameData.shuttle_pos
                        : [frameData.shuttle_pos];
                    currentBoxes = [...preds];
                }
            } else {
                // IMAGE LOGIC: Just show all boxes returned
                // Assuming backend returns a simpler structure for images
                if (results.predictions) {
                    currentBoxes = results.predictions;
                }
            }

            // 4. Draw Boxes
            currentBoxes.forEach((box: any) => {
                // Determine Scaling Factors
                // original resolution vs displayed size
                const originalWidth =
                    (media as HTMLVideoElement).videoWidth ||
                    (media as HTMLImageElement).naturalWidth;
                const originalHeight =
                    (media as HTMLVideoElement).videoHeight ||
                    (media as HTMLImageElement).naturalHeight;

                const scaleX = media.clientWidth / originalWidth;
                const scaleY = media.clientHeight / originalHeight;

                // Roboflow/YOLO usually returns x (center), y (center), width, height
                // Need to convert to Top-Left for canvas drawing
                const x = (box.x - box.width / 2) * scaleX;
                const y = (box.y - box.height / 2) * scaleY;
                const w = box.width * scaleX;
                const h = box.height * scaleY;

                // Draw Box
                ctx.strokeStyle = "#00FF00"; // Bright Green
                ctx.lineWidth = 3;
                ctx.strokeRect(x, y, w, h);

                // Draw Label
                ctx.fillStyle = "#00FF00";
                ctx.font = "14px sans-serif";
                ctx.fillText(
                    `${box.class || "Shuttle"} (${Math.round(
                        box.confidence * 100
                    )}%)`,
                    x,
                    y - 5
                );
            });

            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => cancelAnimationFrame(animationFrameId);
    }, [results, file]); // Re-run if results change or file type changes

    return (
        <div className="w-full max-w-xl mx-auto mt-10 p-6 rounded-xl bg-neutral-900 text-white shadow-xl">
            <h2 className="text-2xl font-bold mb-4">Upload Video or Image</h2>

            {/* FILE INPUT */}
            <input
                type="file"
                accept="image/*,video/*"
                onChange={handleFileChange}
                className="mb-4 block w-full text-white"
            />

            {/* PREVIEW & CANVAS CONTAINER */}
            {previewURL && (
                <div className="mb-4 relative w-full rounded-lg overflow-hidden bg-black">
                    {file?.type.startsWith("image") ? (
                        <img
                            // @ts-ignore
                            ref={mediaRef}
                            src={previewURL}
                            alt="preview"
                            className="w-full block"
                        />
                    ) : (
                        <video
                            // @ts-ignore
                            ref={mediaRef}
                            src={previewURL}
                            controls
                            className="w-full block"
                        />
                    )}

                    {/* CANVAS OVERLAY */}
                    <canvas
                        ref={canvasRef}
                        className="absolute top-0 left-0 w-full h-full pointer-events-none"
                    />
                </div>
            )}

            {/* SUBMIT BUTTON */}
            <button
                onClick={sendToBackend}
                disabled={!file || loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-600 
                           transition py-2 rounded-lg font-semibold"
            >
                {loading ? "Analyzing..." : "Analyze"}
            </button>

            {/* RAW JSON RESULTS (Optional Debug) */}
            {results && (
                <div className="mt-6 bg-neutral-800 p-4 rounded-lg max-h-64 overflow-auto">
                    <h3 className="text-xl font-semibold mb-2">Raw Data</h3>
                    <pre className="text-sm whitespace-pre-wrap">
                        {JSON.stringify(results, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
}
