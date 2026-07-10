/**
 * Server-function middleware chain: authenticated + admin role required.
 * Any server function using this rejects unauthenticated callers and
 * callers without the `admin` role in `user_roles`.
 */
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./auth-middleware";

export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await (context.supabase as any).rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error(`Forbidden: role check failed (${error.message})`);
    if (!data) throw new Error("Forbidden: admin role required");
    return next();
  });
