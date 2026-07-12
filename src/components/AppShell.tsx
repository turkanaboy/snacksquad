import type { ReactNode } from "react";

export type AppView = "home" | "log" | "contests" | "fantasy" | "profile";

type Props = {
  view: AppView;
  displayName: string;
  email: string;
  onNavigate: (view: AppView) => void;
  onSignOut: () => void;
  fantasyEnabled: boolean;
  children: ReactNode;
};

const navigation: Array<{ view: AppView; label: string; icon: string }> = [
  { view: "home", label: "Home", icon: "⌂" },
  { view: "log", label: "Log Snack", icon: "+" },
  { view: "contests", label: "Bracket", icon: "♜" },
  { view: "profile", label: "Profile", icon: "○" },
];

export function AppShell({ view, displayName, email, onNavigate, onSignOut, fantasyEnabled, children }: Props) {
  const desktopNavigation = fantasyEnabled ? [...navigation.slice(0, 3), { view: "fantasy" as const, label: "Fantasy", icon: "▣" }, navigation[3]] : navigation;
  const mobileNavigation = navigation;
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="side-rail">
        <button className="wordmark" onClick={() => onNavigate("home")} aria-label="Snack Squad home">
          <span>SNACK</span><span>SQUAD</span>
        </button>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {desktopNavigation.map((item) => (
            <button
              key={item.view}
              className={view === item.view ? "nav-item selected" : "nav-item"}
              aria-current={view === item.view ? "page" : undefined}
              onClick={() => onNavigate(item.view)}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
          {!fantasyEnabled ? <button className="nav-item locked" disabled>
            <span className="nav-icon" aria-hidden="true">▣</span>
            <span>Fantasy<small>Locked</small></span>
          </button> : null}
        </nav>
        <div className="rail-profile">
          <span className="avatar" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>
          <span className="rail-profile-copy"><b>{displayName}</b><small>{email}</small></span>
          <button className="text-button" onClick={onSignOut}>Sign out</button>
        </div>
      </aside>
      <main id="main-content" className="main-stage">{children}</main>
      <nav className="mobile-nav" aria-label="Primary navigation">
        {mobileNavigation.map((item) => (
          <button
            key={item.view}
            className={view === item.view ? "mobile-nav-item selected" : "mobile-nav-item"}
            aria-current={view === item.view ? "page" : undefined}
            onClick={() => onNavigate(item.view)}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.view === "log" ? "Log" : item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
