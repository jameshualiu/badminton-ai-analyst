// src/videoService.ts

// 1. Notice: No more firebase/firestore imports!
// The backend now handles all database writes.

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export type VideoStatus = "uploading" | "queued" | "running" | "done" | "failed";

export type Result<T, E = ApiError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export class ApiError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

/**
 * Helper for calling your Express backend.
 * Throws ApiError on non-ok responses so callers can discriminate by statusCode.
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
    throw new ApiError(errorMessage, response.status);
  }

  return (await response.json()) as T;
}

/**
 * 1. Ask backend to create DB record & generate upload URL
 * 2. Uploads file to IDrive e2 directly
 * 3. Tells backend upload is done
 *
 * Returns a Result — never throws. Callers pattern-match on ok/error.
 */
export async function createAndUploadVideo(
  file: File,
  token: string,
): Promise<Result<{ videoId: string }, ApiError>> {
  try {
    // Step 1: INIT
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
      },
    );

    // Step 2: UPLOAD directly to E2 storage via presigned URL
    const uploadResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "video/mp4" },
      body: file,
    });

    if (!uploadResponse.ok) {
      return {
        ok: false,
        error: new ApiError("Failed to upload file to storage.", uploadResponse.status),
      };
    }

    // Step 3: COMPLETE — backend marks status "queued" and triggers worker
    await api(`/videos/${videoId}/complete`, token, { method: "POST" });

    return { ok: true, value: { videoId } };
  } catch (e) {
    if (e instanceof ApiError) return { ok: false, error: e };
    return {
      ok: false,
      error: new ApiError(
        e instanceof Error ? e.message : "Upload failed. Please try again.",
        0,
      ),
    };
  }
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
