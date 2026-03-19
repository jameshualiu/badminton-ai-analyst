export function formatDuration(totalSeconds: number | string | null | undefined) {
  const seconds = Number(totalSeconds);
  if (Number.isNaN(seconds) || seconds <= 0) return "0:00";

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}