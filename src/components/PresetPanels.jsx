import { LuInfo, LuTrash2 } from 'react-icons/lu'

import { ElementIcon, PresetIcon } from '@/components/PresetIcon'

// P9 Tier B — choosing an intervention from the library, and shaping it.
//
// Four tools share one panel because they answer the same question, "what
// changes in this square", and splitting them across four panels would make
// the choice between them feel larger than it is. Freeform drawing was first;
// the library, the recess and demolition are new neighbours, not replacements.
// Demolition is the odd one out — it takes a building away rather than adding
// one — and it is also the only move that can raise isovist area, which every
// additive preset lowers. Without it, whole regions of the corpus typology
// (anything needing more open area) were unreachable by design.
//
// Everything here is presentation. Geometry generation lives in lib/presets.js
// and measurement in lib/sandbox.js, both of which are tested; this file draws
// what they produce and collects what the designer changes.

export function ToolTabs({ value, onChange, disabled }) {
  const tools = [
    { id: 'freeform', label: 'Draw freehand' },
    { id: 'preset', label: 'From library' },
    { id: 'recess', label: 'Carve a recess' },
    // The only move that can make a plaza's isovists LARGER. Every additive
    // preset lowers area, compactness and occlusivity together, so without
    // this whole regions of the typology cannot be reached at all.
    { id: 'demolish', label: 'Remove a building' },
  ]
  // TWO BY TWO, not four across. In the 300 px tool column four labels of this
  // length shrink to about seventy pixels each and wrap mid-phrase; abbreviating
  // them to fit ("Recess", "Remove") would have made the destructive tool the
  // least clearly labelled one on the page.
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line-strong bg-line-strong">
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(t.id)}
          aria-pressed={value === t.id}
          className={`px-3 py-1.5 text-xs font-medium transition-colors duration-150 disabled:opacity-40 ${
            value === t.id
              ? t.id === 'demolish'
                ? 'bg-redline text-bg'
                : 'bg-ink text-bg'
              : 'bg-paper text-ink-muted hover:text-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// The library. Each card carries the preset's own description, because
// choosing between a colonnade and a screen wall is an architectural decision
// and the names alone do not carry it.
export function PresetPicker({ presets, value, onChange }) {
  return (
    <div className="mt-3 space-y-1.5">
      {presets.map((preset) => {
        const chosen = value === preset.id
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChange(chosen ? null : preset.id)}
            aria-pressed={chosen}
            className={`w-full rounded-md border p-2.5 text-left transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-wash ${
              chosen
                ? 'border-primary bg-primary-wash'
                : 'border-line bg-paper hover:border-line-strong'
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                {/* The same glyph the placed-element list uses, so choosing
                    from the library and finding the thing again afterwards are
                    the same act of recognition. */}
                <PresetIcon
                  preset={preset.id}
                  className={`h-3.5 w-3.5 shrink-0 ${chosen ? 'text-primary' : 'text-ink-faint'}`}
                />
                <span className="truncate text-xs font-medium text-ink">{preset.name}</span>
              </span>
              {preset.subtractive && (
                <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-ink-faint">
                  subtractive
                </span>
              )}
            </span>
            {chosen && (
              <span className="mt-1.5 block text-[11px] leading-relaxed text-ink-muted">
                {preset.blurb}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// Live parameter sliders for one placed element.
//
// LIVE MEANS LIVE, in two speeds. Dragging regenerates the geometry every frame
// and the plan follows immediately; the full-plaza remeasure is debounced
// behind it, because 967 points at 360 rays is about 180 ms and one cast per
// slider frame would queue faster than they complete. So the shape is always
// current and the numbers are at most one debounce behind — the right way
// round, since the shape is what you are aiming and the numbers are what you
// are judging.
export function ParamSliders({ preset, element, onChange, onRemove, onRotate, computing }) {
  if (!preset || !element) return null
  return (
    <div className="mt-3 rounded-md border border-line bg-paper p-3">
      <div className="flex items-baseline justify-between gap-2 border-b border-line pb-2">
        <h4 className="text-xs font-semibold text-ink">{preset.name}</h4>
        <button
          type="button"
          onClick={() => onRemove(element.id)}
          className="shrink-0 font-mono text-[10px] text-ink-faint transition-colors hover:text-redline"
        >
          remove
        </button>
      </div>

      <div className="mt-2.5 space-y-2.5">
        {Object.entries(preset.params).map(([key, spec]) => (
          <div key={key}>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={`p-${element.id}-${key}`} className="text-[11px] text-ink-muted">
                {spec.label}
              </label>
              <span className="font-mono text-[11px] tabular-nums text-ink">
                {element.params[key]}
                {spec.unit ? ` ${spec.unit}` : ''}
              </span>
            </div>
            <input
              id={`p-${element.id}-${key}`}
              type="range"
              min={spec.min}
              max={spec.max}
              step={spec.step}
              value={element.params[key]}
              onChange={(e) => onChange(element.id, key, Number(e.target.value))}
              className="mt-0.5 w-full"
              style={{ accentColor: 'var(--color-accent)' }}
            />
          </div>
        ))}

        {/* A recess takes its direction from the facade it is cut into, so
            rotating one would be meaningless. */}
        {onRotate && element.kind === 'preset' && (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={`rot-${element.id}`} className="text-[11px] text-ink-muted">
                Rotation
              </label>
              <span className="font-mono text-[11px] tabular-nums text-ink">
                {Math.round(element.rotation_deg ?? 0)}°
              </span>
            </div>
            <input
              id={`rot-${element.id}`}
              type="range"
              min={0}
              max={359}
              step={1}
              value={element.rotation_deg ?? 0}
              onChange={(e) => onRotate(element.id, Number(e.target.value))}
              className="mt-0.5 w-full"
              style={{ accentColor: 'var(--color-accent)' }}
            />
          </div>
        )}
      </div>

      {computing && (
        <p className="mt-2 font-mono text-[10px] text-primary">
          <span className="animate-pulse">remeasuring…</span>
        </p>
      )}

      {/* The instrument's blind spots, stated where the design decision is
          being made rather than buried in a methods note. */}
      {preset.limitation && (
        <p className="mt-3 flex gap-1.5 border-t border-line pt-2 text-[10px] leading-relaxed text-warn">
          <LuInfo aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
          {preset.limitation}
        </p>
      )}
    </div>
  )
}

// Everything standing in the sandbox, whatever tool made it.
export function ElementList({ elements, describe, selectedId, onSelect, onDelete }) {
  if (!elements.length) return null
  return (
    <ol className="mt-3 space-y-1">
      {elements.map((el, i) => {
        const selected = el.id === selectedId
        return (
          <li
            key={el.id}
            className={`flex items-center gap-2 rounded-md pr-1 font-mono text-[11px] transition-colors duration-150 ${
              selected ? 'bg-primary-wash text-ink' : 'text-ink-muted hover:bg-bg/60'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(selected ? null : el.id)}
              className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-1 text-left"
            >
              <span className="w-4 shrink-0 text-ink-faint">{i + 1}</span>
              {/* The glyph carries the KIND; the text carries the settings. A
                  list of five colonnades at different lengths is then five
                  readings of one shape rather than five sentences to parse. */}
              <ElementIcon
                element={el}
                className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-primary' : 'text-ink-faint'}`}
              />
              <span className="flex-1 truncate">
                {describe(el)}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(el.id)}
              aria-label={`Remove element ${i + 1}`}
              className="shrink-0 rounded p-0.5 text-ink-faint transition-colors hover:bg-redline-wash hover:text-redline"
            >
              <LuTrash2 className="h-3 w-3" />
            </button>
          </li>
        )
      })}
    </ol>
  )
}

// How the two P9-only measures are allowed to be presented.
//
// They are NOT equally reliable and must never appear side by side as though
// they were. Solidity replaces compactness cleanly; solid share is saturated at
// this site and carries only its sign; solid frontage answers a different
// question altogether and judges nothing. Saying so beside the numbers is the
// only thing stopping a reader from treating a 0.1% move as a result.
export function MetricCaveats({ solidShareNote, solidFrontageNote }) {
  return (
    <details className="mt-4 rounded-lg border border-line bg-surface p-3">
      <summary className="cursor-pointer text-xs font-semibold text-ink">
        How to read the two P9-only measures
      </summary>
      <dl className="mt-2 space-y-2 text-[11px] leading-relaxed">
        <div>
          <dt className="font-medium text-ink">Solidity (convex hull) — reliable</dt>
          <dd className="text-ink-muted">
            Replaces compactness wherever an intervention introduces thin discrete elements.
            Compactness falls by half on pergola posts alone; solidity by four percent, because a
            convex hull ignores serration while still registering a real mass.
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Solid share — sign only</dt>
          <dd className="text-warn">{solidShareNote}</dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Solid frontage — not a verdict</dt>
          <dd className="text-ink-faint">{solidFrontageNote}</dd>
        </div>
      </dl>
    </details>
  )
}
