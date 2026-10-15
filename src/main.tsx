import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error("Z-Drive UI error", error); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ position: "fixed", inset: 0, background: "#020617", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui", padding: 24 }}>
          <div style={{ maxWidth: 560 }}>
            <div style={{ fontSize: 48, fontWeight: 900, fontStyle: "italic" }}><span style={{ color: "#facc15" }}>Z</span>-DRIVE</div>
            <p style={{ color: "#fca5a5", marginTop: 12 }}>Something went wrong: {this.state.error.message}</p>
            <button onClick={() => location.reload()} style={{ marginTop: 16, padding: "10px 20px", borderRadius: 10, background: "#facc15", color: "#020617", fontWeight: 700, border: 0, cursor: "pointer" }}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(<ErrorBoundary><App /></ErrorBoundary>);
