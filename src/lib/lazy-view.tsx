import { Component, lazy, Suspense, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

export type ViewLoader = () => Promise<{ default: ComponentType }>;

/** Status text shown while a lazy chunk loads. */
export function LoadingStatus() {
  const { t } = useTranslation("common");
  return (
    <div
      role="status"
      className="rounded-xl border bg-card p-6 text-sm text-muted-foreground motion-safe:animate-pulse"
    >
      {t("lazy.loading")}
    </div>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation("common");
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-dashed bg-card p-6 text-card-foreground"
    >
      <p className="text-sm">{t("lazy.failed")}</p>
      <Button variant="outline" onClick={onRetry}>
        {t("lazy.retry")}
      </Button>
    </div>
  );
}

class Boundary extends Component<
  { onRetry: () => void; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  retry = () => {
    this.props.onRetry();
    this.setState({ failed: false });
  };

  render() {
    return this.state.failed ? <LoadFailed onRetry={this.retry} /> : this.props.children;
  }
}

/**
 * Renders a view from a lazily loaded chunk. While it loads a status is shown; if the chunk
 * cannot be loaded, an error with a retry button is shown. Retrying imports the chunk again
 * (a rejected `React.lazy` stays rejected, so a new lazy component is created) without reloading
 * the page, so the imported trips in memory are kept, and nothing is written to browser storage.
 */
export function LazyView({ load }: { load: ViewLoader }) {
  const [View, setView] = useState(() => lazy(load));
  return (
    <Boundary onRetry={() => setView(() => lazy(load))}>
      <Suspense fallback={<LoadingStatus />}>
        <View />
      </Suspense>
    </Boundary>
  );
}

/** Runs `task` when the browser is idle (or after a short delay); returns a canceller. */
export function whenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(task);
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 300);
  return () => window.clearTimeout(id);
}
