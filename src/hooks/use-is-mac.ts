import { useEffect, useState } from "react";

/**
 * Detects whether the current platform is macOS for displaying the correct
 * keyboard shortcut modifier (⌘ vs Ctrl). Returns false during SSR and on
 * the first client render, then resolves after mount.
 */
export function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(
      typeof navigator !== "undefined" &&
        (navigator.platform?.toLowerCase().includes("mac") ||
          navigator.userAgent?.toLowerCase().includes("mac")),
    );
  }, []);
  return isMac;
}