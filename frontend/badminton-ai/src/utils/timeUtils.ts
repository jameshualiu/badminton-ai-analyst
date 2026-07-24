export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60),
    s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
