import { useRef, useState } from 'react'
import { LuDownload } from 'react-icons/lu'

// A figure that can leave the app and land in a thesis.
//
// SVG is offered first and deliberately: a thesis is printed, and a vector
// figure stays sharp at any size and can still be recoloured or relabelled in
// Illustrator or Inkscape afterwards. PNG is there for slides and for anything
// that will not take an SVG, rendered at 3x so it survives print.
//
// The download is built from the live DOM node rather than from a second,
// export-only rendering of the chart. Keeping one source means the file cannot
// quietly disagree with what is on screen — the commonest way an exported
// figure ends up misreporting a result.

export function Figure({ title, caption, filename, children, note }) {
  const holder = useRef(null)
  const [busy, setBusy] = useState(false)

  function serialise() {
    const svg = holder.current?.querySelector('svg')
    if (!svg) return null
    const clone = svg.cloneNode(true)
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

    // Inline the computed colours. The chart is styled with CSS custom
    // properties, which mean nothing once the file is opened outside the app —
    // without this the exported figure comes out black on transparent.
    const source = svg.querySelectorAll('*')
    const target = clone.querySelectorAll('*')
    for (let i = 0; i < source.length; i++) {
      const computed = getComputedStyle(source[i])
      const el = target[i]
      for (const prop of ['fill', 'stroke', 'stroke-width', 'font-size', 'font-family', 'font-weight', 'opacity', 'stroke-dasharray']) {
        const value = computed.getPropertyValue(prop)
        if (value && value !== 'none') el.setAttribute(prop, value)
      }
      el.removeAttribute('class')
    }

    // An explicit white ground: a transparent figure dropped onto a dark slide
    // becomes invisible, and a thesis page is white anyway.
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bg.setAttribute('x', clone.getAttribute('viewBox')?.split(' ')[0] ?? 0)
    bg.setAttribute('y', clone.getAttribute('viewBox')?.split(' ')[1] ?? 0)
    bg.setAttribute('width', '100%')
    bg.setAttribute('height', '100%')
    bg.setAttribute('fill', '#ffffff')
    clone.insertBefore(bg, clone.firstChild)

    return new XMLSerializer().serializeToString(clone)
  }

  function save(blob, extension) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filename}.${extension}`
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoked on the next tick — revoking synchronously can cancel the download
    // in some browsers before it has read the blob.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function downloadSVG() {
    const text = serialise()
    if (text) save(new Blob([text], { type: 'image/svg+xml;charset=utf-8' }), 'svg')
  }

  function downloadPNG() {
    const text = serialise()
    const svg = holder.current?.querySelector('svg')
    if (!text || !svg) return
    setBusy(true)

    const box = svg.getBoundingClientRect()
    const SCALE = 3 // print-usable rather than screen-sized
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(box.width * SCALE))
      canvas.height = Math.max(1, Math.round(box.height * SCALE))
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (blob) save(blob, 'png')
        setBusy(false)
      }, 'image/png')
    }
    image.onerror = () => setBusy(false)
    image.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`
  }

  return (
    <figure className="mt-6 rounded-lg border border-line bg-paper p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b border-line pb-2">
        <div className="min-w-0">
          <figcaption className="text-sm font-semibold text-ink">{title}</figcaption>
          {caption && <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted">{caption}</p>}
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={downloadSVG}
            title="Vector — best for the thesis document"
            className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-paper px-2.5 py-1 font-mono text-[11px] text-ink-muted transition-colors duration-150 hover:border-primary hover:text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
          >
            <LuDownload aria-hidden className="h-3 w-3" />
            SVG
          </button>
          <button
            onClick={downloadPNG}
            disabled={busy}
            title="Raster at 3x — for slides"
            className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-paper px-2.5 py-1 font-mono text-[11px] text-ink-muted transition-colors duration-150 hover:border-primary hover:text-primary disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-primary-wash"
          >
            <LuDownload aria-hidden className="h-3 w-3" />
            {busy ? '…' : 'PNG'}
          </button>
        </div>
      </div>
      <div ref={holder} className="overflow-x-auto">
        {children}
      </div>
      {note && <p className="mt-3 border-t border-line pt-2 text-xs text-ink-faint">{note}</p>}
    </figure>
  )
}
