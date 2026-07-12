/**
 * Global fetch interceptor: when a server-fn call returns 401, route the
 * user to /auth and preserve where they were. Runs client-side only.
 */
import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

let installed = false;

export function use401Interceptor() {
  const router = useRouter();
  useEffect(() => {
    if (installed || typeof window === "undefined") return;
    installed = true;
    const orig = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const res = await orig(input, init);
      try {
        const url = typeof input === "string" ? input : (input as Request).url ?? "";
        // Only intercept our own server-fn / API traffic to avoid hijacking
        // third-party 401s (e.g. tile CDNs, analytics beacons).
        const sameOrigin = url.startsWith("/") || url.startsWith(window.location.origin);
        const isServerFn = /\/_serverFn\/|\/api\//.test(url);
        if (res.status === 401 && sameOrigin && isServerFn && !window.location.pathname.startsWith("/auth")) {
          const next = window.location.pathname + window.location.search;
          router.navigate({ to: "/auth", search: { next } as any });
        }
      } catch {
        // Never let interception logic crash the request path.
      }
      return res;
    };
  }, [router]);
}
