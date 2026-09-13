"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** JSON fetch that throws ApiError with the server's friendly message. */
export async function api<T = unknown>(url: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "No connection. Check your internet and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? "ERROR", data.message ?? "Something went wrong");
  }
  return data as T;
}

export const post = <T = unknown>(url: string, body: unknown = {}) => api<T>(url, { method: "POST", body });

/** Full page load (not client navigation) so live connections and cached data are dropped. */
export function hardNavigate(path: string) {
  window.location.assign(path);
}

export async function logout() {
  await post("/api/auth/logout").catch(() => {});
  hardNavigate("/staff/login");
}
