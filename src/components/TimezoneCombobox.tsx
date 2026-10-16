"use client";

import { useId, useMemo, useRef, useState } from "react";
import { searchZones, suggestZoneFromAddress, zoneLabel, ZONE_LABELS } from "@/lib/tz-search";

const inputClass = "mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30";

// Searchable time zone picker. Value is always an IANA zone id.
export default function TimezoneCombobox({ value, onChange, address }: { value: string; onChange: (zone: string) => void; address: string }) {
  const id = useId();
  const listId = `${id}-list`;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const all = useMemo(() => (typeof Intl !== "undefined" && "supportedValuesOf" in Intl ? Intl.supportedValuesOf("timeZone") : []), []);
  const results = useMemo(() => {
    const hits = query.trim() ? searchZones(query, all) : [...Object.keys(ZONE_LABELS), ...all.filter((z) => !(z in ZONE_LABELS))];
    return hits.slice(0, 50);
  }, [query, all]);
  const suggested = useMemo(() => suggestZoneFromAddress(address), [address]);

  function choose(zone: string) {
    onChange(zone);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, results.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (event.key === "Enter" && open && results[active]) { event.preventDefault(); choose(results[active]); }
    else if (event.key === "Escape") { setOpen(false); setQuery(""); }
  }

  return (
    <div className="relative" data-testid="tz-combobox">
      <label htmlFor={id} className="block text-sm font-medium text-[var(--cr-muted)]">Business timezone</label>
      <input
        id={id}
        ref={inputRef}
        name="timezone"
        autoComplete="off"
        data-testid="business-timezone"
        data-value={value}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${id}-opt-${active}` : undefined}
        className={inputClass}
        placeholder={zoneLabel(value)}
        value={open ? query : zoneLabel(value)}
        onFocus={() => { setOpen(true); setQuery(""); setActive(0); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); setActive(0); }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul id={listId} role="listbox" aria-label="Time zones" data-testid="tz-options" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-teal-500/30 bg-[var(--cr-surface,#0b1220)] text-sm shadow-lg">
          {results.length === 0 && <li className="px-3 py-2 text-[var(--cr-muted)]" data-testid="tz-empty">No matching time zones</li>}
          {results.map((zone, i) => (
            <li
              key={zone}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={zone === value}
              data-testid="tz-option"
              data-zone={zone}
              className={`cursor-pointer px-3 py-2 ${i === active ? "bg-teal-500/20" : ""}`}
              onMouseDown={(event) => { event.preventDefault(); choose(zone); }}
              onMouseEnter={() => setActive(i)}
            >
              {zoneLabel(zone)}{zone in ZONE_LABELS ? <span className="ml-1 text-xs text-[var(--cr-muted)]">{zone}</span> : null}
            </li>
          ))}
        </ul>
      )}
      {suggested && suggested !== value && (
        <p className="mt-1 text-xs" data-testid="tz-suggest" data-zone={suggested}>
          Suggested from your address: {zoneLabel(suggested)} —{" "}
          <button type="button" data-testid="tz-suggest-use" className="font-semibold text-teal-700 underline dark:text-teal-300" onClick={() => onChange(suggested)}>Use this</button>
        </p>
      )}
      <span className="mt-1 block text-xs text-[var(--cr-muted)]">Used for the date on card payments. Type a state, city or zone (e.g. TN, Chicago, Eastern).</span>
    </div>
  );
}
