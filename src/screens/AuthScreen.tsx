import { useEffect, useState, type FormEvent } from "react";
import { friendlyError } from "../errors";

type Props = {
  initialError?: string;
  onRequestLink: (email: string) => Promise<void>;
};

export function AuthScreen({ initialError, onRequestLink }: Props) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(initialError || "");
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1_000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onRequestLink(email);
      setSent(true);
      setCooldown(60);
    } catch (nextError) {
      setError(friendlyError(nextError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="auth-title">
        <p className="auth-wordmark" aria-label="Snack Squad">SNACK<br />SQUAD</p>
        <div>
          <p className="section-label">Carnegie Higher Ed · private team space</p>
          <h1 id="auth-title">Your snack break has standings now.</h1>
          <p className="auth-intro">Log what you grabbed, back a coworker’s pick, and see what survives the weekly bracket.</p>
        </div>
        {sent ? (
          <div className="auth-success" role="status">
            <strong>Check your inbox.</strong>
            <p>We sent a one-time sign-in link to <b>{email.trim().toLowerCase()}</b>.</p>
            <button className="secondary-button" onClick={() => setSent(false)}>Use another email</button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label htmlFor="email">Company email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@carnegiehighered.com"
              required
              autoFocus
            />
            <button className="primary-button" disabled={busy || cooldown > 0}>
              {busy ? "Sending…" : cooldown ? `Try again in ${cooldown}s` : "Email me a magic link"}
            </button>
          </form>
        )}
        {error ? <p className="error-message" role="alert">{error}</p> : null}
        <p className="auth-footnote">Only @carnegiehighered.com addresses can join.</p>
      </section>
      <aside className="auth-scoreboard" aria-hidden="true">
        <span>01</span><b>Log today’s snack</b>
        <span>02</span><b>Move the leaderboard</b>
        <span>03</span><b>Claim the bracket</b>
      </aside>
    </main>
  );
}
