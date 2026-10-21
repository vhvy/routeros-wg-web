export const states: Record<string, string> = {
  online: "活跃",
  offline: "离线",
  never: "未握手",
  disabled: "已禁用",
};
export function bytes(raw: string) {
  const n = Number(raw || 0);
  if (!Number.isFinite(n)) return raw;
  return n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(1)} MB`;
}
