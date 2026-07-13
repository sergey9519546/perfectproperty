import { createFileRoute, redirect, useSearch, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { safeNext } from "@/lib/safe-next";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" ? s.next : "/",
  }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ href: safeNext(search.next) });
  },
  component: AuthPage,
});

function AuthPage() {
  const { next } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) window.location.href = safeNext(next);
    });
    return () => sub.subscription.unsubscribe();
  }, [next]);

  async function handleGoogle() {
    setBusy(true);
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/auth?next=${encodeURIComponent(safeNext(next))}`,
    });
    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    window.location.href = safeNext(next);
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else navigate({ to: safeNext(next) as "/" });
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 dark">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        <h1 className="text-xl font-semibold text-foreground">Sign in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Perfect Property Engine</p>

        <button
          onClick={handleGoogle}
          disabled={busy}
          className="mt-6 w-full rounded-md border border-border bg-background px-4 py-2 text-sm text-foreground hover:bg-muted disabled:opacity-50"
        >
          Continue with Google
        </button>

        <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          or
          <div className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={handleEmail} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Sign in
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="mt-4 text-xs text-muted-foreground">
          Access is provisioned by an administrator.
        </p>

        <div className="mt-6 text-xs text-muted-foreground">
          <Link to="/" className="hover:text-foreground">
            ← Back to app
          </Link>
        </div>
      </div>
    </main>
  );
}
