import type { Credentials } from "../types.ts";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// The browser owns RouterOS paths, methods, headers and payloads.
export async function forward<T>(
  credentials: Credentials,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const auth = new TextEncoder().encode(
    `${credentials.username}:${credentials.password}`,
  );
  const response = await fetch("/api/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({
      target: credentials.address,
      path: `/rest/${path}`,
      method,
      headers: {
        Authorization: `Basic ${btoa(String.fromCharCode(...auth))}`,
        "Content-Type": "application/json",
      },
      body,
    }),
  });
  if (response.status === 204) return undefined as T;
  const result = await response.json();
  if (!response.ok) {
    const detail =
      result.detail || result.message || result.error || "RouterOS 请求失败";
    throw new ApiError(
      typeof detail === "string" ? detail : "RouterOS 请求失败",
      response.status,
    );
  }
  return result as T;
}

export function routerClient(credentials: Credentials) {
  return <T>(path: string, method = "GET", body?: unknown) =>
    forward<T>(credentials, path, method, body);
}
export type RouterClient = ReturnType<typeof routerClient>;
