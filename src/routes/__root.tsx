import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 dark">
      <div className="max-w-md text-center">
        <h1 className="display text-7xl text-foreground num">404</h1>
        <p className="mt-4 text-sm text-muted-foreground">This parcel isn't in the genome.</p>
        <Link to="/" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Return to the map</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => { reportLovableError(error, { boundary: "tanstack_root_error_component" }); }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 dark">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">The engine hit an exception</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Retry</button>
          <a href="/" className="rounded-md border border-border bg-surface px-4 py-2 text-sm text-foreground">Home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Perfect Property Engine — every parcel, underwritten every night" },
      { name: "description", content: "The county glows where profit lives. Nightly underwriting for every parcel, listed or not, across CA and FL." },
      { property: "og:title", content: "Perfect Property Engine" },
      { property: "og:description", content: "The Bloomberg terminal of residential opportunity. Every parcel, underwritten every night." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700;9..144,800&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" },
      { rel: "stylesheet", href: "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <div className="dark min-h-screen bg-background text-foreground">
        <TopNav />
        <Outlet />
        <Toaster theme="dark" position="bottom-right" />
      </div>
    </QueryClientProvider>
  );
}

function TopNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-8 px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="h-2.5 w-2.5 rounded-full bg-opportunity opp-pulse text-opportunity" />
          <span className="eyebrow text-foreground">Perfect Property Engine</span>
        </Link>
        <nav className="flex items-center gap-1 text-[13px]">
          {[
            { to: "/", label: "Map" },
            { to: "/deals", label: "Ranked Deals" },
            { to: "/shadow", label: "Shadow Market" },
            { to: "/prophecy", label: "Prophecy" },
            { to: "/accuracy", label: "Accuracy" },
            { to: "/admin", label: "Ingestion" },
          ].map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
              activeProps={{ className: "rounded-md px-3 py-1.5 bg-surface text-foreground" }}
              activeOptions={{ exact: l.to === "/" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-profit-strong" />
          <span className="num">engine live · CA + FL pilot</span>
        </div>
      </div>
    </header>
  );
}
