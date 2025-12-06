import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Upload, FileVideo, X, Film } from "lucide-react";
import { Button } from "./ui/button";

interface UploadModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onUpload: (file: File) => void;
}

export function UploadModal({
    open,
    onOpenChange,
    onUpload,
}: UploadModalProps) {
    const [dragActive, setDragActive] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    const handleFile = (file: File) => {
        if (file.type.startsWith("video/")) {
            setSelectedFile(file);
        } else {
            console.error("Please upload a video file");
        }
    };

    const onButtonClick = () => {
        inputRef.current?.click();
    };

    const handleUploadClick = () => {
        if (selectedFile) {
            onUpload(selectedFile);
            // Reset state after upload
            setTimeout(() => {
                setSelectedFile(null);
                onOpenChange(false);
            }, 500);
        }
    };

    const handleCancel = () => {
        setSelectedFile(null);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl bg-black/90 border-purple-500/20 backdrop-blur-2xl text-white shadow-2xl shadow-purple-900/20 p-0 overflow-hidden gap-0">
                <DialogHeader className="p-6 border-b border-white/10 bg-gradient-to-r from-purple-900/10 to-transparent">
                    <DialogTitle className="text-2xl font-light tracking-wide flex items-center gap-2">
                        <Film className="w-5 h-5 text-purple-400" />
                        Upload Match Footage
                    </DialogTitle>
                </DialogHeader>

                <div className="p-6">
                    {!selectedFile ? (
                        <div
                            className={`group relative flex flex-col items-center justify-center w-full h-80 border-2 border-dashed rounded-2xl transition-all duration-300 ease-out ${
                                dragActive
                                    ? "border-purple-500 bg-purple-500/10 scale-[1.02]"
                                    : "border-white/10 hover:border-purple-500/50 hover:bg-white/5"
                            }`}
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                        >
                            <input
                                ref={inputRef}
                                type="file"
                                className="hidden"
                                accept="video/*"
                                onChange={handleChange}
                            />

                            <div className="flex flex-col items-center gap-4 p-6 text-center z-10">
                                <div
                                    className={`p-5 rounded-full transition-all duration-300 ${
                                        dragActive
                                            ? "bg-purple-500/20 scale-110 shadow-[0_0_30px_rgba(168,85,247,0.4)]"
                                            : "bg-white/5 group-hover:bg-purple-500/10 group-hover:scale-110 group-hover:shadow-[0_0_20px_rgba(168,85,247,0.2)]"
                                    }`}
                                >
                                    <Upload
                                        className={`w-10 h-10 transition-colors duration-300 ${
                                            dragActive || selectedFile
                                                ? "text-purple-400"
                                                : "text-gray-400 group-hover:text-purple-300"
                                        }`}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <p className="text-xl font-medium text-white/90">
                                        Drag and drop your video
                                    </p>
                                    <p className="text-sm text-gray-400">
                                        or{" "}
                                        <button
                                            type="button"
                                            onClick={onButtonClick}
                                            className="text-purple-400 hover:text-purple-300 hover:underline font-medium"
                                        >
                                            browse files
                                        </button>
                                    </p>
                                </div>
                                <div className="mt-4 flex gap-3 text-xs text-gray-500">
                                    <span className="px-2 py-1 bg-white/5 rounded border border-white/5">
                                        MP4
                                    </span>
                                    <span className="px-2 py-1 bg-white/5 rounded border border-white/5">
                                        MOV
                                    </span>
                                    <span className="px-2 py-1 bg-white/5 rounded border border-white/5">
                                        AVI
                                    </span>
                                </div>
                            </div>

                            {/* Animated grid background effect */}
                            <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
                        </div>
                    ) : (
                        <div className="w-full py-4 space-y-6">
                            <div className="relative overflow-hidden flex items-center gap-4 p-5 bg-gradient-to-br from-white/5 to-white/[0.02] rounded-2xl border border-white/10 group">
                                <div className="p-4 bg-gradient-to-br from-purple-500/20 to-purple-700/20 rounded-xl border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.1)]">
                                    <FileVideo className="w-8 h-8 text-purple-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-lg text-white/90 truncate mb-1">
                                        {selectedFile.name}
                                    </p>
                                    <div className="flex items-center gap-3 text-sm text-gray-400">
                                        <span>
                                            {(
                                                selectedFile.size /
                                                (1024 * 1024)
                                            ).toFixed(2)}{" "}
                                            MB
                                        </span>
                                        <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
                                        <span className="text-purple-400/80">
                                            Ready to upload
                                        </span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedFile(null)}
                                    className="p-2 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex justify-end gap-3 pt-2">
                                <Button
                                    variant="ghost"
                                    onClick={handleCancel}
                                    className="px-6 py-6 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition-all"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleUploadClick}
                                    className="px-8 py-6 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 hover:from-purple-400 hover:to-purple-600 text-white shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 border-0 transition-all hover:-translate-y-0.5 text-base font-medium"
                                >
                                    Upload Analysis
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
