import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 text-red-400" />
            </div>
            <h2 className="text-lg font-light text-white mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-gray-500 font-light mb-6">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900/50 border border-zinc-800/50 rounded-full text-sm font-light text-gray-400 hover:text-white hover:border-zinc-700/50 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              <a
                href="/home"
                className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-full text-sm font-light hover:bg-gray-100 transition-colors"
              >
                <Home className="w-4 h-4" />
                Go Home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
