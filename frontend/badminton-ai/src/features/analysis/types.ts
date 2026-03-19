export type VideoStatus = "local" | "uploaded" | "processing" | "complete" | "failed";

export interface DashboardVideoCard {
  id: string;
  title: string;
  createdAt?: any; // Firestore Timestamp
  date: string; // ISO string for convenience
  thumbnail?: string | null; // optional for now
  duration?: number | null; // seconds
  totalShots?: number | null;
  status?: VideoStatus;
}