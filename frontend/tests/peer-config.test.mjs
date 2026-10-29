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
function service(peer, settings = config) {
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
  return new WireGuardService(api, credentials, settings);
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

test("optional DNS is exported in Interface for both files and QR contents", async () => {
  const pair = generateKeys();
  const peer = {
    ".id": "*1", interface: "wg1",
    "public-key": pair.publicKey, "private-key": pair.privateKey,
    "allowed-address": "10.76.0.2/32",
  };
  for (const dns of [undefined, [], ["1.1.1.1"], ["10.76.0.1", "2606:4700:4700::1111"]]) {
    const exported = await service(peer, { ...config, dns }).export("*1");
    if (dns?.length) {
      assert.ok(exported.includes(`Address = 10.76.0.2/32\nDNS = ${dns.join(", ")}\n\n[Peer]`));
    } else {
      assert.ok(!/^DNS\s*=/m.test(exported));
    }
    assert.ok(exported.includes("PersistentKeepalive = 25"));
  }
});

test("creating and editing peers omits RouterOS keepalive for all client intervals", async () => {
  for (const keepalive of [0, 25, 65535]) {
    const pair = generateKeys();
    const writes = [];
    const existing = { ".id": "*1", interface: "wg1", "allowed-address": "10.76.0.2/32" };
    const api = async (path, method, body) => {
      if (method === "PUT" || method === "PATCH") {
        writes.push({ method, body });
        return { ".id": "*1" };
      }
      if (path.startsWith("interface/wireguard/peers?")) return [existing];
      if (path.startsWith("interface/wireguard?")) return [{ name: "wg1", "listen-port": "57340" }];
      if (path.startsWith("ip/address?")) return [{ interface: "wg1", address: "10.76.0.1/24" }];
      throw new Error(`Unexpected request: ${path}`);
    };
    const client = new WireGuardService(api, credentials, { ...config, keepalive });
    await client.save({ interface: "wg1", comment: "new", ...pair });
    await client.save({ id: "*1", interface: "wg1", comment: "edited" });
    assert.deepEqual(writes.map((w) => w.method), ["PUT", "PATCH"]);
    for (const write of writes) assert.equal("persistent-keepalive" in write.body, false);
    assert.equal(writes[0].body["allowed-address"], "10.76.0.3/32");
    assert.equal(writes[1].body["allowed-address"], undefined);
    assert.equal(writes[1].body["private-key"], undefined);
  }
});

test("client export retains the configured keepalive interval including zero", async () => {
  const pair = generateKeys();
  const peer = {
    ".id": "*1", interface: "wg1",
    "public-key": pair.publicKey, "private-key": pair.privateKey,
    "allowed-address": "10.76.0.2/32", "persistent-keepalive": "17s",
  };
  for (const keepalive of [0, 25, 65535]) {
    const exported = await service(peer, { ...config, keepalive }).export("*1");
    assert.ok(exported.includes(`PersistentKeepalive = ${keepalive}\n`));
  }
});
