import { Timestamp } from "firebase/firestore";
import type { VideoStatus } from "./videoService";
export type { VideoStatus };

export interface DashboardVideoCard {
    id: string;
    title: string;
    createdAt?: Timestamp;
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

export interface TrackingPlayer {
    id: number;
    skeleton: ([number, number] | null)[];
    box: [number, number, number, number];
}

export interface TrackingFrame {
    frame: number;
    players: TrackingPlayer[];
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
        court_keypoints_6: [number, number][] | null;   // [TL, TR, ML, MR, BL, BR]
        court_keypoints_35: [number, number][] | null;  // 7 rows x 5 cols expanded grid
    } | null;
    events: AnalysisShot[];
    tracking: TrackingFrame[];
    shuttle_debug?: { frame: number; pos: [number, number] | null; confidence: number }[];
}
