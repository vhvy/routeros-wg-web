import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeys } from "../src/keys.ts";
import { defaultConfig } from "../src/lib/validation.ts";
import { WireGuardService } from "../src/services/wireguard.ts";

const credentials = {
  address: "http://192.168.233.1",
  username: "test",
  password: "test",
};
const config = {
  ...defaultConfig,
  "router-address": credentials.address,
  interfaces: [],
};
function service(peer) {
  const server = generateKeys();
  const api = async (path) => {
    if (path.startsWith("interface/wireguard/peers?")) return [peer];
    if (path.startsWith("interface/wireguard?"))
      return [
        { name: "wg1", "public-key": server.publicKey, "listen-port": "57340" },
      ];
    if (path.startsWith("ip/address?")) return [];
    throw new Error(`Unexpected request: ${path}`);
  };
  return new WireGuardService(api, credentials, config);
}

test("QR eligibility depends only on a readable returned client private key", async () => {
  const pair = generateKeys();
  const base = {
    ".id": "*1",
    interface: "wg1",
    "public-key": pair.publicKey,
    "allowed-address": "10.76.0.2/32",
    "private-key": pair.privateKey,
  };
  const client = service(base);
  const peer = (await client.overview()).peers[0];
  assert.equal(peer.managed, false, "no configured or detected pool");
  assert.equal(peer.hasConfig, true);
  assert.ok(
    (await client.export("*1")).includes(`PrivateKey = ${pair.privateKey}`),
  );
  for (const key of [undefined, "", "none", "auto", "********"]) {
    const missing = service({ ...base, "private-key": key });
    assert.equal((await missing.overview()).peers[0].hasConfig, false);
    await assert.rejects(missing.export("*1"), /客户端私钥/);
  }
});

test("a preshared key is exported without disabling the QR button", async () => {
  const pair = generateKeys(),
    psk = generateKeys().privateKey;
  const client = service({
    ".id": "*2",
    interface: "wg1",
    "public-key": pair.publicKey,
    "private-key": pair.privateKey,
    "allowed-address": "10.76.0.3/32",
    "preshared-key": psk,
  });
  assert.equal((await client.overview()).peers[0].hasConfig, true);
  const exported = await client.export("*2");
  assert.ok(exported.includes(`PresharedKey = ${psk}`));
  assert.ok(exported.includes("Endpoint = 192.168.233.1:57340"));
});
