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
test("router addresses accept domains with optional schemes and ports", () => {
  for (const [input, expected] of [
    ["router.example.com", "https://router.example.com"],
    [" router.example.com:8443 ", "https://router.example.com:8443"],
    ["http://router.example.com:8080", "http://router.example.com:8080"],
    ["https://router.example.com", "https://router.example.com"],
    ["https://[2001:db8::1]:8443", "https://[2001:db8::1]:8443"],
  ]) assert.equal(normalizeAddress(input), expected);
  for (const input of ["", "-router.example", "router..example", "router_example.me", "router.example:0", "router.example:65536", "ftp://router.example", "https://user:pass@router.example", "https://router.example/rest", "https://router.example?x=1", "https://router.example#x"])
    assert.throws(() => normalizeAddress(input), input);
  const config = { ...defaultConfig, "router-address": "router.example.com:8443" };
  assert.equal(validateConfig(config), config);
});
test("production pool reports covering peer ranges and reserves all 11 addresses", () => {
  const config = { ...iface, name: "wg1", pool: "10.76.0.0/24", start: "10.76.0.10", end: "10.76.0.20" };
  assert.equal(allocate(config, [], [{ address: "10.76.0.1/24" }]), "10.76.0.10/32");
  for (const range of ["10.76.0.2/24", "0.0.0.0/0"]) {
    assert.throws(() => allocate(config, [{ ".id": "*A", interface: config.name, "allowed-address": range }], []), (error) => error.message.includes(range) && error.message.includes("Peer *A") && error.message.includes(config.start));
  }
  const peers = Array.from({ length: 11 }, (_, i) => ({ ".id": `*${i + 1}`, interface: config.name, "allowed-address": `10.76.0.${i + 10}/32` }));
  assert.throws(() => allocate(config, peers, []), /地址池已满/);
  assert.equal(allocate(config, peers.slice(0, 10), []), "10.76.0.20/32");
  assert.equal(allocate(config, [{ ".id": "*A", interface: "other", "allowed-address": "0.0.0.0/0" }], []), "10.76.0.10/32");
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
  for (const dns of [[], ["1.1.1.1"], ["10.76.0.1", "2606:4700:4700::1111"]])
    assert.deepEqual(validateConfig({ ...value, dns }).dns, dns);
  for (const dns of [null, "1.1.1.1", ["invalid"], ["1.1.1.1\nPostUp = bad"], ["1.1.1.1/32"], [42]])
    assert.throws(() => validateConfig({ ...value, dns }), /DNS/);
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
