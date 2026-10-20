import { StrictMode, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/vazirmatn";
import "./app/styles.css";
import App from "./app/App";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="fatal-error">
        <h1>TournaStudio</h1>
        <p>
          The workspace could not open. Your saved database has not been
          removed.
        </p>
        <p lang="fa" dir="rtl">
          فضای مدیریت باز نشد. پایگاه داده ذخیره شده شما حذف نشده است.
        </p>
        <button className="button primary" onClick={() => location.reload()}>
          Reload / بارگذاری دوباره
        </button>
        <a
          href="#/"
          onClick={() => {
            location.hash = "/";
            location.reload();
          }}
        >
          Home / خانه
        </a>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
