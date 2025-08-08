import { Component, ErrorInfo, ReactNode } from "react";

type Props = { children: ReactNode };

type State = { hasError: boolean };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Graph render error", error, info);
  }

  render() {
    if (this.state.hasError) {
      return <div>Failed to render graph.</div>;
    }
    return this.props.children;
  }
}
