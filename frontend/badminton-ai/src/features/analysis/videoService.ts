// src/videoService.ts

// 1. Notice: No more firebase/firestore imports!
// The backend now handles all database writes.

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export type VideoStatus = "uploading" | "queued" | "running" | "done" | "failed";

/** * Helper for calling your Express backend.
 * Now requires a 'token' to identify the user securely.
 */
async function api<T>(path: string, token: string, opts?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...(opts?.headers || {}),
    },
  });

  if (!response.ok) {
    let errorMessage = `Request failed: ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorMessage;
    } catch {
      // Fallback if response is not JSON
    }
    throw new Error(errorMessage);
  }

  return (await response.json()) as T;
}

/**
 * 1. Ask backend to create DB record & generate upload URL
 * 2. Uploads file to IDrive e2 directly
 * 3. Tells backend upload is done
 */
export async function createAndUploadVideo(file: File, token: string) {
  // Step 1: INIT
  // Backend creates the Firestore document with "uploading" status
  // and gives us a secure URL to upload the file.
  const { videoId, uploadUrl } = await api<{ videoId: string; uploadUrl: string }>(
    `/videos/init`,
    token, 
    {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type || "video/mp4",
        size: file.size,
      }),
    }
  );

  // Step 2: UPLOAD
  // Send file directly to Cloud storage (IDrive e2)
  // Note: We use standard fetch here, not the api() helper, because
  // we are hitting the external storage URL, not our backend.
  await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "video/mp4" },
    body: file,
  });

  // Step 3: COMPLETE
  // Tell backend we are finished. Backend updates status to "queued".
  await api(`/videos/${videoId}/complete`, token, {
    method: "POST",
  });

  return { videoId };
}

/**
 * Fetch results/artifacts for a processed video.
 */
export async function getVideoResults(videoId: string, token: string) {
  return api<{
    status: VideoStatus;
    urls: Partial<Record<string, string>>;
  }>(`/videos/${videoId}/results`, token, { method: "GET" });
}

/**
 * Delete a video and its artifacts.
 */
export async function deleteVideo(videoId: string, token: string) {
  return api<{ success: boolean }>(`/videos/${videoId}`, token, { method: "DELETE" });
}