import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, MagnifyingGlass, MapPin } from '@phosphor-icons/react'
import type { WorkspaceParcel } from '../live'

type Props = {
  open: boolean
  parcels: WorkspaceParcel[]
  onClose: () => void
  onSelect: (parcel: WorkspaceParcel) => void
}

export function CommandPalette({ open, parcels, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActiveIndex(0)
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [open, onClose])

  useLayoutEffect(() => {
    if (!open) return
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    inputRef.current?.focus()
    return () => {
      previousFocusRef.current?.focus()
      previousFocusRef.current = null
    }
  }, [open])

  const results = useMemo(
    () =>
      parcels.filter((parcel) =>
        `${parcel.address} ${parcel.city} ${parcel.state} ${parcel.ringLabel} ${parcel.scope}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [parcels, query],
  )

  useEffect(() => {
    setActiveIndex((current) =>
      results.length === 0 ? -1 : Math.min(Math.max(current, 0), results.length - 1),
    )
  }, [results.length])

  useEffect(() => {
    if (!open || activeIndex < 0) return
    document
      .getElementById(`parcel-option-${results[activeIndex]?.id}`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open, results])

  const choose = (index: number) => {
    const parcel = results[index]
    if (!parcel) return
    onSelect(parcel)
    onClose()
  }

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) =>
        results.length === 0 ? -1 : (current + 1 + results.length) % results.length,
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) =>
        results.length === 0 ? -1 : (current - 1 + results.length) % results.length,
      )
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      choose(activeIndex)
    }
  }

  const trapFocus = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    )
    if (focusable.length === 0) {
      event.preventDefault()
      dialogRef.current?.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 grid place-items-start bg-pp-page/85 p-4 pt-[13vh] backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) onClose()
          }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="parcel-search-title"
            tabIndex={-1}
            onKeyDown={trapFocus}
            initial={{ opacity: 0, y: -18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.99 }}
            transition={{ type: 'spring', stiffness: 180, damping: 24 }}
            className="w-full max-w-2xl overflow-hidden rounded-lg border border-pp-border/18 bg-pp-surface shadow-dialog"
          >
            <h2 id="parcel-search-title" className="sr-only">
              Search parcels
            </h2>
            <label className="relative block border-b border-pp-border/18">
              <span className="sr-only">Search parcels</span>
              <MagnifyingGlass
                size={20}
                className="absolute left-5 top-1/2 -translate-y-1/2 text-pp-faint"
              />
              <input
                ref={inputRef}
                role="combobox"
                aria-autocomplete="list"
                aria-controls="parcel-search-results"
                aria-expanded={open}
                aria-activedescendant={
                  activeIndex >= 0 ? `parcel-option-${results[activeIndex]?.id}` : undefined
                }
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActiveIndex(0)
                }}
                onKeyDown={handleInputKeyDown}
                className="h-16 w-full bg-transparent pl-14 pr-14 text-xl text-pp-text outline-none placeholder:text-pp-faint"
                placeholder="Search address, city, or source…"
              />
              <kbd
                aria-hidden="true"
                className="absolute right-4 top-1/2 -translate-y-1/2 border border-pp-border/18 px-2 py-1 font-mono text-xs text-pp-faint"
              >
                ESC
              </kbd>
            </label>
            <div className="max-h-96 overflow-y-auto p-2">
              <p
                id="parcel-search-results-label"
                className="px-3 py-2 text-xs uppercase tracking-widest text-pp-faint"
              >
                Live scored parcels
              </p>
              <div
                id="parcel-search-results"
                role="listbox"
                aria-labelledby="parcel-search-results-label"
              >
                {results.map((parcel, index) => (
                  <motion.button
                    layout
                    id={`parcel-option-${parcel.id}`}
                    role="option"
                    aria-selected={activeIndex === index}
                    key={parcel.id}
                    onMouseMove={() => setActiveIndex(index)}
                    onFocus={() => setActiveIndex(index)}
                    onClick={() => choose(index)}
                    type="button"
                    className={`group grid w-full grid-cols-[34px_1fr_auto] items-center gap-3 rounded-sm px-3 py-3 text-left transition-colors ${
                      activeIndex === index ? 'bg-pp-gold/10' : 'hover:bg-pp-border/[.07]'
                    }`}
                  >
                    <span className="grid h-8 w-8 place-items-center border border-pp-border/18 text-pp-gold">
                      <MapPin size={17} />
                    </span>
                    <span>
                      <strong className="block text-md font-medium text-pp-text">
                        {parcel.address}
                      </strong>
                      <small className="mt-1 block text-xs text-pp-faint">
                        {parcel.marketLabel} · {parcel.ringLabel}
                      </small>
                    </span>
                    <span className="flex items-center gap-3 font-mono text-md text-pp-gold">
                      {parcel.score.toFixed(1)}
                      <ArrowRight
                        className={`transition-opacity ${activeIndex === index ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                      />
                    </span>
                  </motion.button>
                ))}
                {results.length === 0 && (
                  <div role="status" className="p-10 text-center text-sm text-pp-faint">
                    No parcels found.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}