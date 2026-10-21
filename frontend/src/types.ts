export type RouterRecord = Record<string, string>;
export type Credentials = {
  address: string;
  username: string;
  password: string;
};
export type InterfaceConfig = {
  name: string;
  pool: string;
  start: string;
  end: string;
  endpoint: string;
};
export type VPNConfig = {
  allowedIPs: string[];
  "router-address": string;
  keepalive: number;
  onlineSeconds: number;
  interfaces: InterfaceConfig[];
};
export type Bootstrap = { config: VPNConfig };
export type Peer = {
  id: string;
  interface: string;
  comment: string;
  publicKey: string;
  address: string;
  status: string;
  lastHandshake: string;
  rx: string;
  tx: string;
  endpoint: string;
  hasConfig: boolean;
  managed: boolean;
};
export type Overview = {
  peers: Peer[];
  interfaces: {
    name: string;
    disabled: boolean;
    pool: string;
    endpoint: string;
  }[];
  allowedIPs: string[];
  onlineSeconds: number;
};
export type Editor = {
  id?: string;
  interface: string;
  comment: string;
  publicKey?: string;
  privateKey?: string;
};
export type ExportedConfig = { name: string; config: string; qr: string };
