import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { AlertCircle, CheckCircle2, FileVideo, Film, Upload, X } from "lucide-react";
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
  onSeeAnalysis: (videoId: string, sessionUrl?: string) => void;
}

type UploadState = "idle" | "uploading" | "complete" | "error";

export function UploadModal({ open, onOpenChange, userId, onUpload, onSeeAnalysis }: UploadModalProps) {
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

  useEffect(() => {
    if (uploadState !== "complete" || !uploadedVideoId || !userId) return;
    const unsub = onSnapshot(doc(db, "users", userId, "videos", uploadedVideoId), (snap) => {
      const status = snap.data()?.status;
      if (status === "failed") {
        setErrorMessage(snap.data()?.error ?? "Worker failed to process video.");
        setUploadState("error");
      }
    });
    return unsub;
  }, [uploadState, uploadedVideoId, userId]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const file = e.target.files?.[0];
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
      <DialogContent className="sm:max-w-xl bg-white dark:bg-card border border-slate-200 dark:border-border shadow-xl p-0 overflow-hidden gap-0">

        <DialogHeader className="px-6 py-5 border-b border-slate-200 dark:border-border">
          <DialogTitle className="text-[18px] font-semibold text-foreground flex items-center gap-2">
            <div className="p-1.5 bg-primary/10 border border-primary/20 rounded-lg">
              <Film className="w-4 h-4 text-primary" />
            </div>
            Upload Match Footage
          </DialogTitle>
        </DialogHeader>

        <div className="p-6">

          {/* ── Idle: no file selected ── */}
          {uploadState === "idle" && !selectedFile && (
            <div
              className={`group relative flex flex-col items-center justify-center w-full h-72 border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer outline-none ${
                dragActive
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : "border-slate-300 dark:border-border hover:border-primary/40 dark:hover:border-primary/40 hover:bg-primary/5"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              <input ref={inputRef} type="file" className="hidden" accept="video/*" onChange={handleChange} />
              <div className="flex flex-col items-center gap-4 text-center">
                <div className={`p-4 rounded-2xl border transition-all duration-200 ${
                  dragActive
                    ? "bg-primary/10 border-primary/30"
                    : "bg-slate-100 dark:bg-white/10 border-slate-200 dark:border-border group-hover:bg-primary/10 group-hover:border-primary/30"
                }`}>
                  <Upload className={`w-8 h-8 transition-colors ${dragActive ? "text-primary" : "text-slate-400 dark:text-slate-500 group-hover:text-primary"}`} />
                </div>
                <div>
                  <p className="text-[15px] font-medium text-foreground mb-1">Drag and drop your video</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    or{" "}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
                      className="text-primary hover:text-primary/80 font-medium cursor-pointer transition-colors"
                    >
                      browse files
                    </button>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Idle: file selected ── */}
          {uploadState === "idle" && selectedFile && (
            <div className="space-y-5">
              <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-border rounded-xl">
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl shrink-0">
                  <FileVideo className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate mb-0.5">{selectedFile.name}</p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">
                      {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span className="text-primary font-medium">Ready to upload</span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="cursor-pointer p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-foreground hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
                  aria-label="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex justify-end gap-2.5">
                <button
                  onClick={() => onOpenChange(false)}
                  className="cursor-pointer px-5 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUploadClick}
                  className="cursor-pointer flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] transition-all duration-150"
                >
                  <svg width="12" height="12" viewBox="0 0 11 11" fill="none">
                    <path d="M5.5 1v7M3 3.5l2.5-2.5L8 3.5M1 9.5h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Upload
                </button>
              </div>
            </div>
          )}

          {/* ── Uploading ── */}
          {uploadState === "uploading" && (
            <div className="space-y-5">
              <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-border rounded-xl">
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl shrink-0">
                  <FileVideo className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate mb-0.5">{selectedFile?.name}</p>
                  <p className="text-sm text-primary font-medium">Uploading…</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 dark:text-slate-400">Upload progress</span>
                  <span className="text-primary font-semibold">{uploadProgress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                  <div
                    className="h-full bg-primary transition-all duration-300 rounded-full"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {uploadState === "error" && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-foreground mb-0.5">Upload failed</p>
                  <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
                </div>
              </div>

              <div className="flex justify-end gap-2.5">
                <button
                  onClick={() => onOpenChange(false)}
                  className="cursor-pointer px-5 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setUploadState("idle"); setUploadProgress(0); setErrorMessage(null); }}
                  className="cursor-pointer px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] transition-all duration-150"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* ── Complete ── */}
          {uploadState === "complete" && (
            <div className="space-y-5">
              <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-border rounded-xl">
                <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground mb-0.5">Your video is uploaded!</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Our AI models will review your video and give feedback.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2.5">
                <button
                  onClick={() => onOpenChange(false)}
                  className="cursor-pointer px-5 py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={() => { onSeeAnalysis(uploadedVideoId); onOpenChange(false); }}
                  className="cursor-pointer px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold hover:bg-primary/90 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] transition-all duration-150"
                >
                  See Analysis
                </button>
              </div>
            </div>
          )}

        </div>
      </DialogContent>
    </Dialog>
  );
}
