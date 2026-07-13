import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, MagnifyingGlass, MapPin } from "@phosphor-icons/react";
import type { Market } from "../data";

type Props = {
  open: boolean;
  markets: Market[];
  onClose: () => void;
  onSelect: (market: Market) => void;
};

export function CommandPalette({ open, markets, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => {
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    };
  }, [open]);

  const results = useMemo(
    () =>
      markets.filter((market) =>
        `${market.name} ${market.state} ${market.type}`.toLowerCase().includes(query.toLowerCase()),
      ),
    [markets, query],
  );

  useEffect(() => {
    setActiveIndex((current) =>
      results.length === 0 ? -1 : Math.min(Math.max(current, 0), results.length - 1),
    );
  }, [results.length]);

  useEffect(() => {
    if (!open || activeIndex < 0) return;
    document
      .getElementById(`market-option-${results[activeIndex]?.id}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, results]);

  const chooseMarket = (index: number) => {
    const market = results[index];
    if (!market) return;
    onSelect(market);
    onClose();
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        results.length === 0 ? -1 : (current + 1 + results.length) % results.length,
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) =>
        results.length === 0 ? -1 : (current - 1 + results.length) % results.length,
      );
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      chooseMarket(activeIndex);
    }
  };

  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-20 grid place-items-start bg-[#01070c]/80 p-4 pt-[13vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) onClose();
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="market-search-title"
            tabIndex={-1}
            onKeyDown={trapFocus}
            initial={{ opacity: 0, y: -18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.99 }}
            transition={{ type: "spring", stiffness: 180, damping: 24 }}
            className="w-full max-w-[620px] overflow-hidden rounded-[7px] border border-[#7893a5]/26 bg-[#07131b] shadow-[0_30px_100px_rgba(0,5,9,.58),inset_0_1px_0_rgba(255,255,255,.055)]"
          >
            <h2 id="market-search-title" className="sr-only">
              Search markets
            </h2>
            <label className="relative block border-b border-[#7893a5]/18">
              <span className="sr-only">Search markets or property types</span>
              <MagnifyingGlass
                size={20}
                className="absolute left-5 top-1/2 -translate-y-1/2 text-[#7d909c]"
              />
              <input
                ref={inputRef}
                role="combobox"
                aria-autocomplete="list"
                aria-controls="market-search-results"
                aria-expanded="true"
                aria-activedescendant={
                  activeIndex >= 0 ? `market-option-${results[activeIndex]?.id}` : undefined
                }
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleInputKeyDown}
                className="h-16 w-full bg-transparent pl-14 pr-14 text-[15px] text-[#edf3f6] outline-none placeholder:text-[#60727e]"
                placeholder="Search markets or property types…"
              />
              <kbd
                aria-hidden="true"
                className="absolute right-4 top-1/2 -translate-y-1/2 border border-[#7893a5]/18 px-2 py-1 font-mono text-[10px] text-[#748894]"
              >
                ESC
              </kbd>
            </label>
            <div className="max-h-[390px] overflow-y-auto p-2">
              <p
                id="market-search-results-label"
                className="px-3 py-2 text-[10px] uppercase tracking-[.14em] text-[#677b88]"
              >
                Calibrated markets
              </p>
              <div
                id="market-search-results"
                role="listbox"
                aria-labelledby="market-search-results-label"
              >
                {results.map((market, index) => (
                  <motion.button
                    layout
                    id={`market-option-${market.id}`}
                    role="option"
                    aria-selected={activeIndex === index}
                    key={market.id}
                    onMouseMove={() => setActiveIndex(index)}
                    onFocus={() => setActiveIndex(index)}
                    onClick={() => chooseMarket(index)}
                    type="button"
                    className={`group grid w-full grid-cols-[34px_1fr_auto] items-center gap-3 rounded-[4px] px-3 py-3 text-left ${activeIndex === index ? "bg-[#789fba]/[.085]" : "hover:bg-[#789fba]/[.065]"}`}
                  >
                    <span className="grid h-8 w-8 place-items-center border border-[#7893a5]/18 text-[#efaa2d]">
                      <MapPin size={17} />
                    </span>
                    <span>
                      <strong className="block text-[13px] font-medium">
                        {market.name}, {market.state}
                      </strong>
                      <small className="mt-1 block text-[11px] text-[#7f929e]">
                        {market.type} · {market.opportunities} opportunities
                      </small>
                    </span>
                    <span className="flex items-center gap-3 font-mono text-[13px] text-[#efaa2d]">
                      {market.score.toFixed(1)}
                      <ArrowRight
                        className={`transition-opacity ${activeIndex === index ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                      />
                    </span>
                  </motion.button>
                ))}
                {results.length === 0 && (
                  <div role="status" className="p-10 text-center text-sm text-[#7f929e]">
                    No calibrated markets found.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
