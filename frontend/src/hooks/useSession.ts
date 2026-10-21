import { useCallback, useEffect, useState } from "react";
import type { Bootstrap, VPNConfig } from "../types";
import { defaultConfig, validateConfig } from "../lib/validation";
import { connect, type WireGuardService } from "../services/wireguard";

export function useSession() {
  const [session, setSession] = useState<WireGuardService>();
  const [checking, setChecking] = useState(true);
  const [bootstrapError, setBootstrapError] = useState("");
  const [config, setConfig] = useState<VPNConfig>(defaultConfig);
  const [address, setAddress] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const resetSession = useCallback(() => {
    setSession(undefined);
    setPassword("");
  }, []);

  async function authenticate() {
    if (bootstrapError) throw new Error(bootstrapError);
    const service = await connect({ address, username, password }, config);
    setAddress(service.credentials.address);
    setUsername(service.credentials.username);
    setPassword("");
    setSession(service);
  }

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/bootstrap", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("无法读取控制台启动配置");
        const value: Bootstrap = await response.json();
        const loaded = validateConfig(value.config);
        setAddress(loaded["router-address"]);
        setConfig(loaded);
      } catch (error) {
        if (!controller.signal.aborted)
          setBootstrapError((error as Error).message);
      } finally {
        if (!controller.signal.aborted) setChecking(false);
      }
    })();
    return () => controller.abort();
  }, []);

  return {
    session,
    checking,
    bootstrapError,
    address,
    setAddress,
    username,
    setUsername,
    password,
    setPassword,
    authenticate,
    resetSession,
  };
}
