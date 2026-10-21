import { useCallback, useEffect, useRef, useState } from "react";
import type { Overview } from "../types";
import { ApiError } from "../lib/api";
import type { WireGuardService } from "../services/wireguard";

export function useOverview(
  service: WireGuardService | undefined,
  onUnauthorized: () => void,
) {
  const [data, setData] = useState<Overview>();
  const [updated, setUpdated] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const generation = useRef(0);
  const pending = useRef<number | undefined>(undefined);
  const refresh = useCallback(async () => {
    if (!service || pending.current === generation.current) return;
    const current = generation.current;
    pending.current = current;
    try {
      const result = await service.overview();
      if (current !== generation.current) return;
      setData(result);
      setUpdated(new Date().toLocaleTimeString());
      setRefreshError("");
    } catch (error) {
      if (current === generation.current) {
        if (error instanceof ApiError && error.status === 401) onUnauthorized();
        setRefreshError((error as Error).message);
      }
    } finally {
      if (pending.current === current) pending.current = undefined;
    }
  }, [service, onUnauthorized]);
  useEffect(() => {
    setData(undefined);
    setUpdated("");
    setRefreshError("");
    void refresh();
    const timer = service
      ? setInterval(() => {
          if (!document.hidden) void refresh();
        }, 10_000)
      : undefined;
    return () => {
      generation.current++;
      clearInterval(timer);
    };
  }, [refresh, service]);
  return { data, updated, refresh, refreshError, setRefreshError };
}
