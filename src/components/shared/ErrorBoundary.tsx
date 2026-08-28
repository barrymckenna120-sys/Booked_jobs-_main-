import React from "react";
import * as Sentry from "@sentry/react";
import ErrorFallback from "./ErrorFallback";
import { isChunkLoadError, maybeReloadForChunkError } from "@/lib/chunkError";
import { buildSentryTags } from "@/lib/sentryContext";

interface Props {
  children?: React.ReactNode;
  /** Named in Sentry so we know which area of the app failed. */
  name?: string;
  /** Secondary action destination — engineer screens shouldn't go to /dashboard. */
  homePath?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Route-level boundary. Keeps a crash contained to one screen so the shell
 * (nav, notifications, banners) stays usable, reports to the existing Sentry
 * setup, and reloads once — never more — on a stale-chunk failure.
 */
class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const reloading = maybeReloadForChunkError(error);

    Sentry.captureException(error, {
      tags: {
        ...buildSentryTags(),
        mechanism: "react.errorBoundary",
        boundary: this.props.name ?? "route",
        chunk_error: String(isChunkLoadError(error)),
        auto_reloaded: String(reloading),
      },
      extra: { componentStack: info.componentStack },
    });
  }

  private reset = () => this.setState({ hasError: false });

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          onRetry={this.reset}
          homePath={this.props.homePath ?? "/dashboard"}
        />
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
