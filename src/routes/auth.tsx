import { createFileRoute, redirect, useSearch, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { safeNext } from "@/lib/safe-next";
import { Brand } from "@/features/perfect-property/components/Brand";

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
  const [pendingAction, setPendingAction] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = pendingAction !== null;

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) window.location.href = safeNext(next);
    });
    return () => sub.subscription.unsubscribe();
  }, [next]);

  async function handleGoogle() {
    setPendingAction("google");
    setError(null);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth?next=${encodeURIComponent(safeNext(next))}`,
      });
      if (result.error) {
        setError(result.error.message);
        return;
      }
      if (result.redirected) return;
      window.location.href = safeNext(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to connect to Google. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setPendingAction("email");
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      await navigate({ to: safeNext(next) as "/" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <main className="perfect-property-ui grid min-h-screen bg-[#01070c] text-[#f3f6f8] lg:grid-cols-[minmax(0,1.1fr)_minmax(430px,.9fr)]">
      <section className="relative hidden overflow-hidden border-r border-[#7893a5]/18 lg:block">
        <img src="/perfect-property-hero.png" alt="" className="absolute inset-0 h-full w-full object-cover object-[58%_50%]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(1,7,12,.92),rgba(1,7,12,.35)),linear-gradient(180deg,rgba(1,7,12,.08),rgba(1,7,12,.92))]" />
        <div className="relative flex h-full flex-col p-10 xl:p-14">
          <Link to="/" aria-label="Perfect Property home" className="w-fit"><Brand /></Link>
          <div className="mt-auto max-w-[560px] pb-5">
            <p className="text-[12px] font-medium text-[#efaa2d]">Investment intelligence, with evidence.</p>
            <h1 className="mt-4 text-[44px] font-semibold leading-[1.08] tracking-[-.04em] xl:text-[52px]">See the opportunity.<br />Trace every signal.</h1>
            <p className="mt-5 max-w-[48ch] text-[15px] leading-7 text-[#b0bcc4]">Access calibrated market scores, ranked deals, source lineage, and underwriting actions in one workspace.</p>
          </div>
        </div>
      </section>

      <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
      <div className="w-full max-w-[420px]">
        <Link to="/" aria-label="Perfect Property home" className="mb-10 block w-fit lg:hidden"><Brand /></Link>
        <p className="text-[10px] font-medium uppercase tracking-[.14em] text-[#efaa2d]">Account access</p>
        <h1 className="mt-3 text-[30px] font-semibold tracking-[-.03em]">Sign in to your workspace</h1>
        <p className="mt-2 text-[13px] text-[#8798a3]">Continue with your organization account.</p>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          aria-busy={pendingAction === "google"}
          className="control-button mt-8 h-11 w-full justify-center disabled:opacity-50"
        >
          {pendingAction === "google" ? "Connecting to Google…" : "Continue with Google"}
        </button>

        <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[.12em] text-[#657985]">
          <div className="h-px flex-1 bg-[#7893a5]/18" />
          or
          <div className="h-px flex-1 bg-[#7893a5]/18" />
        </div>

        <form onSubmit={handleEmail} aria-busy={pendingAction === "email"} className="space-y-4">
          <label htmlFor="auth-email" className="sr-only">Email address</label>
          <input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="h-11 w-full rounded-[4px] border border-[#7893a5]/22 bg-[#030b11] px-3 text-[13px] text-[#edf3f6] outline-none placeholder:text-[#60717c] focus:border-[#efaa2d]/70"
          />
          <label htmlFor="auth-password" className="sr-only">Password</label>
          <input
            id="auth-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="h-11 w-full rounded-[4px] border border-[#7893a5]/22 bg-[#030b11] px-3 text-[13px] text-[#edf3f6] outline-none placeholder:text-[#60717c] focus:border-[#efaa2d]/70"
          />
          <button
            type="submit"
            disabled={busy}
            className="primary-button h-11 w-full disabled:opacity-50"
          >
            {pendingAction === "email" ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-4 border border-[#dc5d66]/25 bg-[#dc5d66]/8 px-3 py-2 text-[12px] text-[#ef8189]">
            {error}
          </p>
        )}
        <p className="mt-5 text-[11px] text-[#718592]">
          Access is provisioned by an administrator.
        </p>

        <div className="mt-8 border-t border-[#7893a5]/16 pt-5 text-[11px] text-[#718592]">
          <Link to="/" className="transition-colors hover:text-[#f3f6f8]">
            ← Back to Perfect Property
          </Link>
        </div>
      </div>
      </section>
    </main>
  );
}
