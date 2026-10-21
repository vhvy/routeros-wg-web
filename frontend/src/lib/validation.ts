import type { InterfaceConfig, RouterRecord, VPNConfig } from "../types.ts";

export const defaultConfig: VPNConfig = {
  allowedIPs: ["0.0.0.0/0"],
  "router-address": "",
  keepalive: 25,
  onlineSeconds: 180,
  interfaces: [],
};

export function ipv4(raw: string): number {
  const parts = raw.split(".");
  if (
    parts.length !== 4 ||
    parts.some((p) => !/^(0|[1-9]\d{0,2})$/.test(p) || Number(p) > 255)
  )
    throw new Error("IPv4 地址无效");
  return parts.reduce((n, p) => n * 256 + Number(p), 0);
}
export function ipString(n: number): string {
  return [24, 16, 8, 0].map((bits) => (n >>> bits) & 255).join(".");
}
export function prefix(raw: string) {
  const [address, bits, extra] = raw.split("/");
  if (extra !== undefined || !/^\d+$/.test(bits || "") || Number(bits) > 32)
    throw new Error("IPv4 地址段无效");
  const ip = ipv4(address),
    size = 2 ** (32 - Number(bits));
  const start = Math.floor(ip / size) * size;
  return { ip, bits: Number(bits), start, end: start + size - 1 };
}
export function validIP(raw: string): boolean {
  try {
    ipv4(raw);
    return true;
  } catch {
    /* IPv6 is parsed by the browser URL implementation. */
  }
  if (!raw.includes(":") || raw.includes("%")) return false;
  try {
    return new URL(`http://[${raw}]/`).hostname.startsWith("[");
  } catch {
    return false;
  }
}
export function validCIDR(raw: string): boolean {
  const [ip, bits, extra] = raw.split("/");
  return (
    extra === undefined &&
    validIP(ip) &&
    /^\d+$/.test(bits || "") &&
    Number(bits) <= (ip.includes(":") ? 128 : 32)
  );
}
export function normalizeAddress(raw: string): string {
  let address = raw.trim();
  if (!address.includes("://"))
    address = `https://${address.includes(":") && validIP(address) ? `[${address}]` : address}`;
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    throw new Error("请输入有效的路由器 IP / 地址");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !validIP(host) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("请输入路由器 IP，可包含 http(s):// 和端口，不要添加路径");
  return url.origin;
}
export function validateConfig(value: VPNConfig): VPNConfig {
  if (
    !value ||
    !Array.isArray(value.allowedIPs) ||
    !value.allowedIPs.length ||
    !value.allowedIPs.every(validCIDR) ||
    typeof value["router-address"] !== "string" ||
    !value["router-address"].trim() ||
    !Number.isInteger(value.keepalive) ||
    value.keepalive < 0 ||
    value.keepalive > 65535 ||
    !Number.isInteger(value.onlineSeconds) ||
    value.onlineSeconds < 1 ||
    !Array.isArray(value.interfaces)
  )
    throw new Error("配置的路由器地址、路由、keepalive 或状态阈值无效");
  normalizeAddress(value["router-address"]);
  const seen = new Set<string>();
  for (const iface of value.interfaces) {
    const pool = prefix(iface.pool),
      start = ipv4(iface.start),
      end = ipv4(iface.end);
    if (
      !iface.name ||
      seen.has(iface.name) ||
      pool.bits < 16 ||
      pool.bits > 30 ||
      start <= pool.start ||
      end >= pool.end ||
      start > end
    )
      throw new Error("接口或地址池配置无效");
    let endpoint: URL;
    try {
      endpoint = new URL(`udp://${iface.endpoint}`);
    } catch {
      throw new Error("WireGuard endpoint 无效");
    }
    if (
      !endpoint.hostname ||
      !endpoint.port ||
      Number(endpoint.port) < 1 ||
      Number(endpoint.port) > 65535 ||
      endpoint.username ||
      endpoint.password ||
      endpoint.search ||
      endpoint.hash ||
      endpoint.pathname ||
      /\s/.test(iface.endpoint)
    )
      throw new Error("WireGuard endpoint 无效");
    seen.add(iface.name);
  }
  return value;
}
export function validateComment(raw: string): string {
  const comment = raw.trim();
  if (
    new TextEncoder().encode(comment).length > 200 ||
    /[\r\n\0]/.test(comment)
  )
    throw new Error("备注最多 200 字节，且不能包含换行");
  return comment;
}
export function allocate(
  config: InterfaceConfig,
  peers: RouterRecord[],
  addresses: RouterRecord[],
  skip = "",
): string {
  const occupied: { start: number; end: number }[] = [];
  for (const peer of peers) {
    if (peer[".id"] === skip || peer.interface !== config.name) continue;
    for (const address of (peer["allowed-address"] || "").split(",")) {
      try {
        occupied.push(prefix(address.trim()));
      } catch {
        /* IPv6 cannot conflict with an IPv4 pool. */
      }
    }
  }
  for (const row of addresses) {
    try {
      const ip = prefix(row.address).ip;
      occupied.push({ start: ip, end: ip });
    } catch {
      /* IPv6 address. */
    }
  }
  const pool = prefix(config.pool),
    end = ipv4(config.end);
  for (let ip = ipv4(config.start), n = 0; ip <= end && n < 65536; ip++, n++) {
    if (ip < pool.start || ip > pool.end) break;
    if (!occupied.some((p) => ip >= p.start && ip <= p.end))
      return `${ipString(ip)}/32`;
  }
  throw new Error("地址池已满或存在冲突");
}
export function handshakeSeconds(raw: string): number | undefined {
  if (!raw || ["never", "0", "0s"].includes(raw)) return undefined;
  const clock = raw.match(/^(?:(\d+)d)?(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (clock)
    return (
      Number(clock[1] || 0) * 86400 +
      Number(clock[2]) * 3600 +
      Number(clock[3]) * 60 +
      Number(clock[4])
    );
  const units: Record<string, number> = {
    w: 604800,
    d: 86400,
    h: 3600,
    m: 60,
    s: 1,
    ms: 0.001,
    us: 0.000001,
    ns: 0.000000001,
  };
  const matches = [...raw.matchAll(/(\d+(?:\.\d+)?)(ms|us|ns|w|d|h|m|s)/g)];
  if (!matches.length || matches.map((m) => m[0]).join("") !== raw)
    return undefined;
  return matches.reduce((sum, m) => sum + Number(m[1]) * units[m[2]], 0);
}
export function hasPresharedKey(key?: string): boolean {
  return (
    !!key &&
    key !== "none" &&
    key !== "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
  );
}
