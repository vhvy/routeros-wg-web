import { x25519 } from "@noble/curves/ed25519.js";
import type {
  Credentials,
  Editor,
  InterfaceConfig,
  Overview,
  RouterRecord,
  VPNConfig,
} from "../types.ts";
import { routerClient, type RouterClient } from "../lib/api.ts";
import {
  allocate,
  hasPresharedKey,
  handshakeSeconds,
  ipString,
  normalizeAddress,
  prefix,
  validateComment,
  validateConfig,
  validCIDR,
} from "../lib/validation.ts";

function keyValue(value?: string): string | undefined {
  return value && /^[A-Za-z0-9+/]{43}=$/.test(value) ? value : undefined;
}
function clientPrivateKey(peer: RouterRecord): string | undefined {
  return keyValue(peer["private-key"]);
}

const peerPath = "interface/wireguard/peers";
const peerProps =
  ".id,interface,comment,public-key,private-key,allowed-address,disabled,last-handshake,rx,tx,current-endpoint-address,preshared-key";
const peerURL = (id: string) => {
  if (!/^\*[0-9a-f]+$/i.test(id)) throw new Error("Peer ID 无效");
  return `${peerPath}/${encodeURIComponent(id)}`;
};
const list = (api: RouterClient, path: string, props: string) =>
  api<RouterRecord[]>(`${path}?.proplist=${encodeURIComponent(props)}`);
const peers = (api: RouterClient) => list(api, peerPath, peerProps);

export async function connect(credentials: Credentials, config: VPNConfig) {
  const normalized = {
    ...credentials,
    address: normalizeAddress(credentials.address),
    username: credentials.username.trim(),
  };
  if (
    !normalized.username ||
    normalized.username.length > 128 ||
    !normalized.password ||
    normalized.password.length > 1024
  )
    throw new Error("请填写有效的 RouterOS 账号和密码");
  const api = routerClient(normalized);
  await list(api, "interface/wireguard", ".id,name");
  return new WireGuardService(api, normalized, validateConfig(config));
}

export class WireGuardService {
  readonly api: RouterClient;
  readonly credentials: Credentials;
  readonly config: VPNConfig;
  private mutating = false;
  constructor(api: RouterClient, credentials: Credentials, config: VPNConfig) {
    this.api = api;
    this.credentials = credentials;
    this.config = config;
  }

  private async settings() {
    const [interfaces, addresses] = await Promise.all([
      list(
        this.api,
        "interface/wireguard",
        ".id,name,public-key,listen-port,disabled",
      ),
      list(this.api, "ip/address", "address,interface"),
    ]);
    const configs = new Map<string, InterfaceConfig>(
      this.config.interfaces.map((c) => [c.name, c]),
    );
    for (const row of interfaces) {
      if (configs.has(row.name)) continue;
      for (const address of addresses.filter((a) => a.interface === row.name)) {
        try {
          const pool = prefix(address.address);
          if (pool.bits < 16 || pool.bits > 30) continue;
          configs.set(row.name, {
            name: row.name,
            pool: `${ipString(pool.start)}/${pool.bits}`,
            start: ipString(pool.start + 1),
            end: ipString(pool.end - 1),
            endpoint: `${new URL(this.credentials.address).hostname}:${row["listen-port"]}`,
          });
          break;
        } catch {
          /* Only IPv4 pools are auto-detected. */
        }
      }
    }
    return { interfaces, addresses, configs };
  }

  async overview(): Promise<Overview> {
    const [settings, rows] = await Promise.all([
      this.settings(),
      peers(this.api),
    ]);
    return {
      allowedIPs: this.config.allowedIPs,
      onlineSeconds: this.config.onlineSeconds,
      interfaces: settings.interfaces.flatMap((row) => {
        const c = settings.configs.get(row.name);
        return c
          ? [
              {
                name: row.name,
                disabled: row.disabled === "true",
                pool: c.pool,
                endpoint: c.endpoint,
              },
            ]
          : [];
      }),
      peers: rows.map((row) => {
        const seconds = handshakeSeconds(row["last-handshake"]);
        const status =
          row.disabled === "true"
            ? "disabled"
            : seconds === undefined
              ? "never"
              : seconds <= this.config.onlineSeconds
                ? "online"
                : "offline";
        const managed = settings.configs.has(row.interface);
        return {
          id: row[".id"],
          interface: row.interface,
          comment: row.comment || "",
          publicKey: row["public-key"],
          address: row["allowed-address"],
          status,
          lastHandshake: row["last-handshake"] || "",
          rx: row.rx || "0",
          tx: row.tx || "0",
          endpoint: row["current-endpoint-address"] || "",
          managed,
          hasConfig: !!clientPrivateKey(row),
        };
      }),
    };
  }

  private async exclusive<T>(action: () => Promise<T>): Promise<T> {
    if (this.mutating) throw new Error("请等待当前修改完成");
    this.mutating = true;
    try {
      return await action();
    } finally {
      this.mutating = false;
    }
  }

  async save(editor: Editor): Promise<string> {
    return this.exclusive(async () => {
      const comment = validateComment(editor.comment);
      const [settings, rows] = await Promise.all([
        this.settings(),
        peers(this.api),
      ]);
      const c = settings.configs.get(editor.interface);
      if (
        !c ||
        !settings.interfaces.some(
          (i) => i.name === editor.interface && i.disabled !== "true",
        )
      )
        throw new Error("WireGuard 接口不存在、已禁用或没有地址池");
      const old = rows.find((row) => row[".id"] === editor.id);
      if (editor.id && !old) throw new Error("Peer 不存在");
      const data: RouterRecord = { interface: editor.interface, comment };
      if (!old || old.interface !== editor.interface)
        data["allowed-address"] = allocate(
          c,
          rows,
          settings.addresses,
          editor.id,
        );
      if (!editor.id) {
        let secret: Uint8Array;
        try {
          secret = Uint8Array.from(atob(editor.privateKey || ""), (ch) =>
            ch.charCodeAt(0),
          );
        } catch {
          throw new Error("无效的 WireGuard 密钥对");
        }
        if (
          secret.length !== 32 ||
          secret[0] & 7 ||
          secret[31] & 128 ||
          !(secret[31] & 64) ||
          btoa(String.fromCharCode(...x25519.getPublicKey(secret))) !==
            editor.publicKey
        )
          throw new Error("无效的 WireGuard 密钥对");
        if (rows.some((row) => row["public-key"] === editor.publicKey))
          throw new Error("该公钥已存在，请刷新列表");
        data["public-key"] = editor.publicKey!;
        data["private-key"] = editor.privateKey!;
      } else if (editor.privateKey || editor.publicKey)
        throw new Error("编辑只允许修改接口和备注");
      const response = await this.api<RouterRecord>(
        editor.id ? peerURL(editor.id) : peerPath,
        editor.id ? "PATCH" : "PUT",
        data,
      );
      return response[".id"];
    });
  }

  async remove(id: string): Promise<void> {
    await this.exclusive(async () => {
      const peer = (await peers(this.api)).find((row) => row[".id"] === id);
      if (!peer) throw new Error("Peer 不存在");
      await this.api(peerURL(id), "DELETE");
    });
  }

  async export(id: string): Promise<string> {
    const [settings, rows] = await Promise.all([
      this.settings(),
      peers(this.api),
    ]);
    const peer = rows.find((row) => row[".id"] === id);
    if (!peer) throw new Error("Peer 不存在");
    const c = settings.configs.get(peer.interface),
      privateKey = clientPrivateKey(peer);
    if (!privateKey)
      throw new Error(
        "RouterOS 未返回此 Peer 的客户端私钥，请检查私钥配置和 sensitive 权限",
      );
    const psk = peer["preshared-key"];
    if (hasPresharedKey(psk) && !keyValue(psk))
      throw new Error(
        "RouterOS 未返回可读取的预共享密钥，请检查 sensitive 权限",
      );
    const pub = settings.interfaces.find((i) => i.name === peer.interface)?.[
      "public-key"
    ];
    if (!pub || !/^[A-Za-z0-9+/]{43}=$/.test(pub))
      throw new Error("接口公钥不可读取，请检查 RouterOS 权限");
    const addresses = peer["allowed-address"].split(",").map((ip) => ip.trim());
    if (!addresses.length || !addresses.every(validCIDR))
      throw new Error("Peer 的客户端地址无效，无法生成配置");
    const iface = settings.interfaces.find((i) => i.name === peer.interface)!;
    const endpoint =
      c?.endpoint ??
      `${new URL(this.credentials.address).hostname}:${iface["listen-port"]}`;
    return `[Interface]\nPrivateKey = ${privateKey}\nAddress = ${addresses.join(", ")}\n\n[Peer]\nPublicKey = ${pub}\n${hasPresharedKey(psk) ? `PresharedKey = ${psk}\n` : ""}Endpoint = ${endpoint}\nAllowedIPs = ${this.config.allowedIPs.join(", ")}\nPersistentKeepalive = ${this.config.keepalive}\n`;
  }
}
