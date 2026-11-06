/** "12 s ago", "4 min ago", "3 h ago", "2 d ago". */
export function age(timestamp: bigint | number, now = Date.now()): string {
  const s = Math.max(0, Math.round(now / 1000 - Number(timestamp)));
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
}
