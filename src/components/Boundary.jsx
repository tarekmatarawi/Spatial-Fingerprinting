import { Component } from 'react'

// A failure containment boundary that keeps its PARENT mounted.
//
// This is the whole point, and it is easy to get wrong: React state lives in
// the component that declares it, so a boundary placed ABOVE a page unmounts
// that page when it trips and takes every piece of unsaved work with it. Placed
// INSIDE the page, around one section, the page survives — its state intact —
// and only the section is replaced by a message.
//
// P9 needs the second kind. An intervention someone spent twenty minutes
// drawing must not be a casualty of a WebGL context failing to allocate.
export class Boundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(`[${this.props.label ?? 'Boundary'}]`, error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="rounded-lg border border-redline/40 bg-redline-wash p-5">
        <p className="text-sm font-medium text-ink">
          {this.props.title ?? 'This section could not be drawn.'}
        </p>
        <p className="mt-2 font-mono text-[11px] break-words text-ink-muted">
          {String(this.state.error?.message || this.state.error)}
        </p>
        {this.props.note && (
          <p className="mt-2 max-w-xl text-[11px] leading-relaxed text-ink-faint">
            {this.props.note}
          </p>
        )}
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-3 rounded-full border border-line-strong bg-paper px-3 py-1 font-mono text-[11px] text-ink-muted transition-colors hover:border-primary hover:text-primary"
        >
          try again
        </button>
      </div>
    )
  }
}
