import { Component, type ErrorInfo, type ReactNode } from 'react'
import i18n from '../i18n'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * Last-resort boundary around the whole app. Without it, any error thrown
 * while rendering unmounts the React tree and leaves the user staring at the
 * bare `#0d0f13` page background with no way forward.
 *
 * Kept deliberately free of the router, React context and the UI kit so it
 * still renders when those are the thing that broke. It reads copy off the
 * i18next singleton (not the React context) — if i18n itself failed, `t()`
 * falls back to the key string, which is ugly but still renders.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface it for local debugging / whatever log drain the browser feeds.
    console.error('Unhandled render error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="font-semibold text-2xl">{i18n.t('common:errorBoundary.title')}</h1>
        <p className="max-w-md text-muted-foreground text-sm">
          {i18n.t('common:errorBoundary.body')}
        </p>
        <button
          type="button"
          onClick={() => {
            window.location.assign('/')
          }}
          className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm hover:opacity-90"
        >
          {i18n.t('common:errorBoundary.reload')}
        </button>
      </div>
    )
  }
}
