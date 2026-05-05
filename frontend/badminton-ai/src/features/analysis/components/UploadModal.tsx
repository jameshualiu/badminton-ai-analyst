import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import {
  AlertCircle,
  CheckCircle2,
  FileVideo,
  Film,
  Upload,
  X,
} from "lucide-react";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../../../components/ui/dialog";
import { db } from "../../../lib/firebase";
import type { Result } from "../videoService";
import { ApiError } from "../videoService";

interface UploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onUpload: (file: File) => Promise<Result<{ videoId: string }, ApiError>>;

  // future-proof: sessionUrl optional later
  onSeeAnalysis: (videoId: string, sessionUrl?: string) => void;
}

type UploadState = "idle" | "uploading" | "complete" | "error";

export function UploadModal({
  open,
  onOpenChange,
  userId,
  onUpload,
  onSeeAnalysis,
}: UploadModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [uploadedVideoId, setUploadedVideoId] = useState("");

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setSelectedFile(null);
        setUploadState("idle");
        setUploadProgress(0);
        setUploadedVideoId("");
        setErrorMessage(null);
      }, 300);
    }
  }, [open]);

  // Watch Firestore for worker failures after upload completes
  useEffect(() => {
    if (uploadState !== "complete" || !uploadedVideoId || !userId) return;

    const unsub = onSnapshot(
      doc(db, "users", userId, "videos", uploadedVideoId),
      (snap) => {
        const status = snap.data()?.status;
        if (status === "failed") {
          setErrorMessage(
            snap.data()?.error ?? "Worker failed to process video.",
          );
          setUploadState("error");
        }
      },
    );

    return unsub;
  }, [uploadState, uploadedVideoId, userId]);

  const handleDrag = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover")
      setDragActive(true);
    if (event.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();
    const file = event.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleFile = (file: File) => {
    if (file.type.startsWith("video/")) setSelectedFile(file);
  };

  const handleUploadClick = async () => {
    if (!selectedFile) return;

    setUploadState("uploading");
    setErrorMessage(null);
    const interval = setInterval(() => {
      setUploadProgress((prev) => (prev < 90 ? prev + 5 : prev));
    }, 200);

    const result = await onUpload(selectedFile);
    clearInterval(interval);

    if (!result.ok) {
      setErrorMessage(result.error.message);
      setUploadState("error");
      return;
    }

    setUploadedVideoId(result.value.videoId);
    setUploadProgress(100);
    setUploadState("complete");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="theme-dark-blue sm:max-w-xl bg-[#0d1520] border border-primary/20 backdrop-blur-sm text-foreground shadow-[0_0_0_1px_rgba(137,194,217,0.08),0_24px_64px_rgba(0,0,0,0.6)] p-0 overflow-hidden gap-0">
        <DialogHeader className="p-6 border-b border-border/40 bg-background/20">
          <DialogTitle className="text-2xl font-semibold flex items-center gap-2">
            <Film className="w-5 h-5 text-primary" />
            Upload Match Footage
          </DialogTitle>
        </DialogHeader>

        <div className="p-6">
          {uploadState === "idle" &&
            (!selectedFile ? (
              <div
                className={`group relative flex flex-col items-center justify-center w-full h-80 border-2 border-dashed rounded-2xl transition-all duration-300 ease-out cursor-pointer ${
                  dragActive
                    ? "border-primary bg-primary/10 scale-[1.01]"
                    : "border-border/40 hover:border-primary/40 hover:bg-background/30"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                role="button"
                tabIndex={0}
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
                        ? "bg-primary/20"
                        : "bg-card/30 group-hover:bg-primary/10"
                    }`}
                  >
                    <Upload
                      className={`w-10 h-10 transition-colors ${
                        dragActive
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-primary"
                      }`}
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-xl font-medium text-foreground/90">
                      Drag and drop your video
                    </p>
                    <p className="text-sm text-muted-foreground">
                      or{" "}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          inputRef.current?.click();
                        }}
                        className="text-primary hover:opacity-80 hover:underline font-medium cursor-pointer"
                      >
                        browse files
                      </button>
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full py-4 space-y-6">
                <div className="relative overflow-hidden flex items-center gap-4 p-5 bg-background/30 rounded-2xl border border-border/40">
                  <div className="p-4 bg-primary/15 rounded-xl border border-primary/20">
                    <FileVideo className="w-8 h-8 text-primary" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-lg text-foreground/90 truncate mb-1">
                      {selectedFile.name}
                    </p>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span>
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                      <span className="text-primary/80">Ready to upload</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedFile(null)}
                    className="p-2 hover:bg-card/30 rounded-full text-muted-foreground hover:text-foreground transition cursor-pointer"
                    aria-label="Remove file"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button
                    variant="ghost"
                    onClick={() => onOpenChange(false)}
                    className="px-6 py-6 rounded-xl cursor-pointer text-muted-foreground"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleUploadClick}
                    className="w-26 py-6 rounded-xl cursor-pointer items-center gap-2 border-none bg-primary text-[14px] font-medium text-primary-foreground transition-all hover:opacity-90 hover:scale-[1.02]"
                  >
                    <svg width="12" height="12" viewBox="0 0 11 11" fill="none">
                      <path
                        d="M5.5 1v7M3 3.5l2.5-2.5L8 3.5M1 9.5h9"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Upload
                  </Button>
                </div>
              </div>
            ))}

          {uploadState === "uploading" && (
            <div className="w-full py-4 space-y-6">
              <div className="relative overflow-hidden flex items-center gap-4 p-5 bg-background/30 rounded-2xl border border-border/40">
                <div className="p-4 bg-primary/15 rounded-xl border border-primary/20">
                  <FileVideo className="w-8 h-8 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-lg text-foreground/90 truncate mb-1">
                    {selectedFile?.name}
                  </p>
                  <p className="text-sm text-primary/80">Uploading...</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Upload Progress</span>
                  <span className="text-primary font-medium">
                    {uploadProgress}%
                  </span>
                </div>
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-card/25">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {uploadState === "error" && (
            <div className="w-full py-4 space-y-6">
              <div className="flex items-start gap-4 p-5 bg-red-500/10 rounded-2xl border border-red-500/30">
                <AlertCircle className="w-6 h-6 text-red-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground/90 mb-1">
                    Upload failed
                  </p>
                  <p className="text-sm text-red-400">{errorMessage}</p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  className="px-6 py-6 rounded-xl text-muted-foreground"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setUploadState("idle");
                    setUploadProgress(0);
                    setErrorMessage(null);
                  }}
                  className="w-26 py-6 rounded-xl cursor-pointer items-center gap-2 border-none bg-primary text-[14px] font-medium text-primary-foreground transition-all hover:opacity-90 hover:scale-[1.02]"
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}

          {uploadState === "complete" && (
            <div className="w-full py-4 space-y-6">
              <div className="relative overflow-hidden flex items-center gap-4 p-5 bg-background/30 rounded-2xl border border-border/40">
                <div className="p-4 bg-primary/15 rounded-xl border border-primary/20">
                  <CheckCircle2 className="w-8 h-8 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-lg text-foreground/90 truncate mb-1">
                    Your video is uploaded!
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Our AI models will review your video and give feedback.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  className="px-6 py-6 rounded-xl text-muted-foreground"
                >
                  Close
                </Button>
                <Button
                  className="w-33 py-6 rounded-xl cursor-pointer items-center gap-2 border-none bg-primary text-[14px] font-medium text-primary-foreground transition-all hover:opacity-90 hover:scale-[1.02]"
                  onClick={() => {
                    onSeeAnalysis(uploadedVideoId);
                    onOpenChange(false);
                  }}
                >
                  See Analysis
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
