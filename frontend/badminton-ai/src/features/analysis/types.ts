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

export interface AnalysisShot {
  frame: number;
  location_px: [number, number] | null;
  location_m: [number, number] | null;
  type: string;
}

export interface AnalysisData {
  summary: {
    durationSec: number;
    totalShots: number;
    shotCounts: Record<string, number>;
    resolution: [number, number];
  };
  geometry: {
    court: [number, number][] | null;
    net: [number, number][] | null;
  } | null;
  events: AnalysisShot[];
  tracking: unknown[];
}