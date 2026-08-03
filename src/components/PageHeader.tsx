import type { ReactNode } from "react";

/**
 * Single page header used by every authenticated page so titles, subtitles,
 * optional icons and the bottom rule line up identically across routes.
 */
export function PageHeader({
  title,
  sub,
  icon,
  actions,
}: {
  title: string;
  sub: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-b border-border pb-5 sm:flex sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <div className="mt-1 shrink-0">{icon}</div> : null}
        <div className="min-w-0">
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.03em] text-foreground sm:text-[34px] sm:leading-[1.1]">
            {title}
          </h1>
          <p className="mt-2.5 max-w-[70ch] text-[14px] leading-relaxed text-muted-foreground">
            {sub}
          </p>
        </div>
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </header>
  );
}
