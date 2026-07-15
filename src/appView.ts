import type { AppView } from "./components/AppShell";

const appViews: AppView[] = ["home", "log", "contests", "fantasy", "profile"];

export function appViewFromSearch(search: string): AppView {
  const requested = new URLSearchParams(search).get("view");
  return appViews.includes(requested as AppView) ? requested as AppView : "home";
}

export function searchForAppView(search: string, view: AppView): string {
  const params = new URLSearchParams(search);
  if (view === "home") params.delete("view");
  else params.set("view", view);
  if (view !== "fantasy") params.delete("league");
  const next = params.toString();
  return next ? `?${next}` : "";
}
