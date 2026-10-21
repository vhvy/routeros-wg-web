import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allocate,
  defaultConfig,
  handshakeSeconds,
  normalizeAddress,
  validateComment,
  validateConfig,
} from "../src/lib/validation.ts";
const iface = {
  name: "wg1",
  pool: "10.0.0.0/24",
  start: "10.0.0.1",
  end: "10.0.0.254",
  endpoint: "192.168.233.1:57340",
};
test("allocation skips router addresses and peer ranges", () => {
  const peers = [
    { ".id": "*1", interface: "wg1", "allowed-address": "10.0.0.0/29" },
  ];
  assert.equal(
    allocate(iface, peers, [{ address: "10.0.0.8/24" }]),
    "10.0.0.9/32",
  );
  assert.equal(allocate(iface, peers, [], "*1"), "10.0.0.1/32");
  assert.throws(
    () => allocate({ ...iface, end: "10.0.0.7" }, peers, []),
    /地址池已满/,
  );
});
test("RouterOS duration formats and absent handshakes", () => {
  for (const value of ["", "never", "0", "0s", "invalid"])
    assert.equal(handshakeSeconds(value), undefined);
  assert.equal(handshakeSeconds("1w2d3h4m5s"), 788645);
  assert.equal(handshakeSeconds("2d01:02:03"), 176523);
  assert.equal(handshakeSeconds("250ms"), 0.25);
});
test("configuration, comments and router addresses are validated in frontend", () => {
  const value = {
    ...defaultConfig,
    "router-address": "http://192.168.233.1",
    interfaces: [iface],
  };
  assert.equal(validateConfig(value), value);
  assert.throws(() => validateConfig({ ...value, "router-address": "" }));
  assert.equal("dns" in defaultConfig, false);
  assert.throws(() =>
    validateConfig({ ...value, interfaces: [{ ...iface, start: "10.0.0.0" }] }),
  );
  assert.throws(() => validateConfig({ ...value, allowedIPs: ["invalid"] }));
  assert.equal(validateComment(" 中文 "), "中文");
  assert.throws(() => validateComment("中".repeat(67)));
  assert.equal(normalizeAddress("192.168.233.1"), "https://192.168.233.1");
  assert.equal(
    normalizeAddress("http://192.168.233.1:80"),
    "http://192.168.233.1",
  );
  assert.equal(normalizeAddress("::1"), "https://[::1]");
  assert.throws(() => normalizeAddress("http://192.168.233.1/rest"));
});
