import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorBanner } from './reader/components/ErrorBanner'

interface Props {
  children: ReactNode
  /** Optional label shown as the banner title. */
  label?: string
}

interface State {
  error: Error | null
}

/**
 * Catches render-time errors so a single broken viewer/view doesn't take
 * down the whole shell. Pairs with `ErrorBanner` for visual consistency
 * with our viewer error states.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface to console for dev; production telemetry can hook in here.
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="flex-1 min-h-0">
          <ErrorBanner
            severity="error"
            title={this.props.label ?? 'Something went wrong'}
            message={error.message}
          />
        </div>
        <div className="flex justify-center pb-6">
          <button
            onClick={this.reset}
            className="text-xs px-3 py-1 rounded border"
            style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}
