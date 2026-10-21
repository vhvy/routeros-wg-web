import { x25519 } from "@noble/curves/ed25519.js";
export const base64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
export function generateKeys() {
  const secret = crypto.getRandomValues(new Uint8Array(32));
  secret[0] &= 248;
  secret[31] &= 127;
  secret[31] |= 64;
  return {
    privateKey: base64(secret),
    publicKey: base64(x25519.getPublicKey(secret)),
  };
}
