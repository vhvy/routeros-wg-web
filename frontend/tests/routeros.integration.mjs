// Requires an explicitly authorized disposable RouterOS and the running Go proxy.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { x25519 } from "@noble/curves/ed25519.js";
import { connect } from "../src/services/wireguard.ts";

const fileConfig = JSON.parse(
  await readFile(new URL("../../config.json", import.meta.url), "utf8"),
);
let input = "";
for await (const chunk of process.stdin) input += chunk;
const options = JSON.parse(input || "{}");
const config = options.config || fileConfig;
const address = options.address || config["router-address"];
const { username, password } = options;
if (!username || !password)
  throw new Error("Provide test username and password as JSON on stdin");
const app = options.app || "http://127.0.0.1:8080",
  iface = options.interface || "wg1";
const tag = `wg-web-test-${randomBytes(4).toString("hex")}`;
const originalFetch = globalThis.fetch,
  forwarded = [];
globalThis.fetch = (input, init) => {
  if (input === "/api/proxy") forwarded.push(JSON.parse(init.body));
  return originalFetch(new URL(input, app), init);
};
async function router(path, method = "GET", body) {
  const response = await originalFetch(`${address}/rest/${path}`, {
    method,
    signal: AbortSignal.timeout(15000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.ok(response.ok, `RouterOS ${method} ${path}: HTTP ${response.status}`);
  return response.status === 204 ? undefined : response.json();
}
function keys() {
  const secret = randomBytes(32);
  secret[0] &= 248;
  secret[31] &= 127;
  secret[31] |= 64;
  return {
    privateKey: secret.toString("base64"),
    publicKey: Buffer.from(x25519.getPublicKey(secret)).toString("base64"),
  };
}
let service,
  checks = 0;
const pass = (name) => {
  checks++;
  console.log(`PASS ${name}`);
};
const peer = (id) =>
  service.overview().then((value) => value.peers.find((p) => p.id === id));
const path = (id) => `interface/wireguard/peers/${encodeURIComponent(id)}`;
try {
  service = await connect({ address, username, password }, config);
  assert.ok(
    (await service.overview()).interfaces.some(
      (i) => i.name === iface && !i.disabled,
    ),
  );
  pass("browser service authenticates through the forwarding backend");
  const auto = await connect(
    { address, username, password },
    { ...config, interfaces: [] },
  );
  assert.ok((await auto.overview()).interfaces.some((i) => i.name === iface));
  pass(
    "detect WireGuard address pool and endpoint without backend business configuration",
  );
  await assert.rejects(
    service.save({
      interface: iface,
      comment: tag,
      privateKey: "invalid",
      publicKey: "invalid",
    }),
    /密钥对/,
  );
  const pair = keys(),
    body = { interface: iface, comment: `${tag}-first`, ...pair };
  const first = await service.save(body);
  assert.ok(first);
  let p = await peer(first);
  assert.equal(p.status, "never");
  assert.equal(p.hasConfig, true);
  assert.equal(p.publicKey, pair.publicKey);
  const addresses = await router("ip/address?.proplist=address,interface");
  assert.ok(
    !addresses.some((a) => a.address.split("/")[0] === p.address.split("/")[0]),
  );
  await assert.rejects(service.save(body), /公钥已存在/);
  pass(
    "frontend key validation, allocation, never-handshaken status and duplicate rejection",
  );
  const second = await service.save({
    interface: iface,
    comment: `${tag}-second`,
    ...keys(),
  });
  assert.notEqual((await peer(second)).address, p.address);
  pass("multiple peers have distinct addresses");
  const exported = await service.export(first),
    wg = (
      await router("interface/wireguard?.proplist=name,public-key,listen-port")
    ).find((i) => i.name === iface);
  assert.ok(exported.includes(`PrivateKey = ${pair.privateKey}`));
  if (config.dns?.length)
    assert.ok(exported.includes(`DNS = ${config.dns.join(", ")}\n`));
  else
    assert.ok(!/^DNS\s*=/m.test(exported), "unconfigured DNS must be omitted");
  assert.ok(exported.includes(`PublicKey = ${wg["public-key"]}`));
  assert.ok(exported.includes(`Address = ${p.address}`));
  assert.ok(exported.includes(`:${wg["listen-port"]}`));
  const submitted = forwarded.find(
    (request) =>
      request.method === "PUT" &&
      request.body?.["public-key"] === pair.publicKey,
  );
  assert.ok(
    submitted?.body["private-key"] === pair.privateKey,
    "creation must submit the generated client private key",
  );
  const saved = (
    await router("interface/wireguard/peers?.proplist=.id,private-key,persistent-keepalive")
  ).find((p) => p[".id"] === first);
  assert.ok(
    saved?.["private-key"] === pair.privateKey,
    "RouterOS must retain the submitted client private key",
  );
  assert.equal("persistent-keepalive" in submitted.body, false);
  assert.ok(exported.includes(`PersistentKeepalive = ${config.keepalive}\n`));
  pass(
    "client public/private keys stored on RouterOS and exported from the returned peer",
  );
  await service.save({
    id: first,
    interface: iface,
    comment: `${tag}-中文编辑`,
  });
  assert.equal((await peer(first)).comment, `${tag}-中文编辑`);
  assert.equal((await peer(first)).address, p.address);
  await assert.rejects(
    service.save({
      id: first,
      interface: iface,
      comment: tag,
      publicKey: pair.publicKey,
    }),
    /只允许/,
  );
  pass("frontend edit validation preserves existing key and address");
  await router(path(first), "PATCH", { "persistent-keepalive": "17s" });
  const routerKeepalive = (await router(`${path(first)}?.proplist=persistent-keepalive`))["persistent-keepalive"];
  const zeroKeepalive = await connect(
    { address, username, password },
    { ...config, keepalive: 0, dns: [] },
  );
  await zeroKeepalive.save({ id: first, interface: iface, comment: `${tag}-zero` });
  const zeroPeer = await router(`${path(first)}?.proplist=persistent-keepalive`);
  assert.equal(zeroPeer["persistent-keepalive"], routerKeepalive);
  const zeroExport = await zeroKeepalive.export(first);
  assert.ok(zeroExport.includes("PersistentKeepalive = 0\n"));
  assert.ok(!/^DNS\s*=/m.test(zeroExport));
  await service.save({ id: first, interface: iface, comment: `${tag}-restored` });
  const restoredPeer = await router(`${path(first)}?.proplist=persistent-keepalive`);
  assert.equal(restoredPeer["persistent-keepalive"], routerKeepalive);
  assert.ok(forwarded.filter((request) => ["PUT", "PATCH"].includes(request.method)).every((request) => !("persistent-keepalive" in request.body)));
  pass("client keepalive changes preserve RouterOS keepalive; empty DNS is omitted");
  await router(path(first), "PATCH", { disabled: "true" });
  assert.equal((await peer(first)).status, "disabled");
  const psk = randomBytes(32).toString("base64");
  await router(path(first), "PATCH", {
    disabled: "false",
    "preshared-key": psk,
  });
  assert.equal((await peer(first)).hasConfig, true);
  assert.ok((await service.export(first)).includes(`PresharedKey = ${psk}`));
  await router(path(first), "PATCH", {
    "preshared-key": Buffer.alloc(32).toString("base64"),
  });
  pass("disabled state and externally assigned preshared key handling");
  service = await connect({ address, username, password }, config);
  assert.equal(await service.export(first), exported);
  pass(
    "fresh service reconnect exports the same private key read from RouterOS",
  );
  for (const id of [first, second]) {
    await service.remove(id);
    assert.equal(await peer(id), undefined);
    await assert.rejects(service.export(id), /不存在/);
  }
  const publicOnlyPair = keys();
  const provisionalID = await service.save({
    interface: iface,
    comment: `${tag}-public-only`,
    ...publicOnlyPair,
  });
  const freeAddress = (await peer(provisionalID)).address;
  await service.remove(provisionalID);
  const external = await router("interface/wireguard/peers", "PUT", {
    interface: iface,
    comment: `${tag}-public-only`,
    "public-key": publicOnlyPair.publicKey,
    "allowed-address": freeAddress,
  });
  assert.equal((await peer(external[".id"])).hasConfig, false);
  await assert.rejects(service.export(external[".id"]), /客户端私钥/);
  await service.remove(external[".id"]);
  pass(
    "peers without returned private keys cannot export; test peers are deleted",
  );
} finally {
  try {
    const remaining = await router(
      "interface/wireguard/peers?.proplist=.id,comment",
    );
    for (const p of remaining.filter((p) => p.comment?.startsWith(tag))) {
      try {
        if (!service) throw new Error("no session");
        await service.remove(p[".id"]);
      } catch {
        await router(path(p[".id"]), "DELETE");
      }
    }
    console.log(`Finished ${checks} checks; test peers cleaned up (${tag})`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}
