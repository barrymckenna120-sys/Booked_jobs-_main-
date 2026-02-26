import React from "react";
import { Button } from "@/components/ui/button";

interface State {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
          <p className="text-lg font-bold text-foreground mb-2">Something went wrong</p>
          <p className="text-sm text-muted-foreground mb-4">The page encountered an error.</p>
          <Button
            onClick={() => {
              this.setState({ hasError: false });
              window.location.href = "/dashboard";
            }}
          >
            Reload Dashboard
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
