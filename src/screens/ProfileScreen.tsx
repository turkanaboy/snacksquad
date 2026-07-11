import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BadgeHistory } from "../components/BadgeHistory";
import type { LeaderboardItem, MySnackLog } from "../snackStore";
import { getMySnackLogs, removeSnackLog } from "../snackStore";
import type { Profile, PublicProfile } from "../profile";
import { isModerator, listSnackCorrections, reviewSnackCorrection, type SnackCorrection } from "../snackMetadata";
import { friendlyError } from "../errors";

type Props = {
  client: SupabaseClient;
  profile: Profile;
  publicProfile: PublicProfile | null;
  leaderboard: LeaderboardItem[];
  onBackToMine: () => void;
  onUpdate: (changes: { displayName?: string; favoriteSnackId?: string | null }) => Promise<void>;
  onReplaceLog: (log: MySnackLog) => void;
  onChanged: () => void;
};

function todayInEastern() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

export function ProfileScreen({
  client, profile, publicProfile, leaderboard, onBackToMine, onUpdate, onReplaceLog, onChanged,
}: Props) {
  const [logs, setLogs] = useState<MySnackLog[]>([]);
  const [corrections, setCorrections] = useState<SnackCorrection[]>([]);
  const [moderator, setModerator] = useState(false);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [favoriteSnackId, setFavoriteSnackId] = useState(profile.favoriteSnackId || "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refreshPrivate() {
    const [nextLogs, nextModerator, nextCorrections] = await Promise.all([
      getMySnackLogs(client),
      isModerator(client),
      listSnackCorrections(client),
    ]);
    setLogs(nextLogs);
    setModerator(nextModerator);
    setCorrections(nextCorrections);
  }

  useEffect(() => {
    if (!publicProfile) void refreshPrivate().catch((error) => setMessage(friendlyError(error)));
  }, [publicProfile]);

  const favoriteOptions = useMemo(() => {
    const options = new Map<string, string>();
    leaderboard.forEach((snack) => options.set(snack.snackId, snack.snackName));
    logs.forEach((log) => options.set(log.snackId, log.snackName));
    return Array.from(options);
  }, [leaderboard, logs]);

  if (publicProfile) {
    return (
      <div className="screen-column profile-screen">
        <button className="back-button" onClick={onBackToMine}>← My profile</button>
        <header className="profile-hero">
          <span className="profile-avatar" aria-hidden="true">{publicProfile.displayName.slice(0, 1)}</span>
          <div><p className="section-label">Squad profile</p><h1>{publicProfile.displayName}</h1><p>Favorite: {publicProfile.favoriteSnackName || "Not chosen yet"}</p></div>
        </header>
        <dl className="profile-stats"><div><dt>Logs</dt><dd>{publicProfile.totalLogs}</dd></div><div><dt>Distinct snacks</dt><dd>{publicProfile.distinctSnacks}</dd></div></dl>
        <section className="profile-section"><h2>Category mix</h2>{Object.keys(publicProfile.categoryMix).length ? <ul className="plain-list">{Object.entries(publicProfile.categoryMix).map(([category, count]) => <li key={category}><span>{category}</span><b>{count}</b></li>)}</ul> : <p className="empty-state">No category history yet.</p>}</section>
        <section className="profile-section"><h2>Badges</h2><BadgeHistory badges={publicProfile.badges} emptyMessage="No badges yet." /></section>
      </div>
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await onUpdate({ displayName, favoriteSnackId: favoriteSnackId || null });
      setMessage("Profile saved.");
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(log: MySnackLog) {
    setBusy(true);
    try {
      await removeSnackLog(client, log.id);
      await refreshPrivate();
      onChanged();
      setMessage("Today’s log was removed.");
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  async function review(correctionId: string, approve: boolean) {
    setBusy(true);
    try {
      await reviewSnackCorrection(client, correctionId, approve);
      await refreshPrivate();
      setMessage(approve ? "Correction approved." : "Correction rejected.");
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  const easternToday = todayInEastern();

  return (
    <div className="screen-column profile-screen">
      <header className="profile-hero"><span className="profile-avatar" aria-hidden="true">{profile.displayName.slice(0, 1)}</span><div><p className="section-label">Your taste file</p><h1>{profile.displayName}</h1><p>Your detailed logs stay private.</p></div></header>
      <form className="profile-form" onSubmit={save}>
        <label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
        <label>Favorite snack<select value={favoriteSnackId} onChange={(event) => setFavoriteSnackId(event.target.value)}><option value="">Not chosen</option>{favoriteOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <button className="primary-button" disabled={busy}>Save profile</button>
      </form>

      <section className="profile-section"><div className="section-heading"><div><h2>Private snack log</h2><p>Only you can see these daily entries.</p></div><span>{logs.length}</span></div>{logs.length ? <ul className="private-log">{logs.map((log) => { const open = log.loggedOn === easternToday; return <li key={log.id}><div><b>{log.snackName}</b><small>{log.loggedOn} · {log.category}</small></div>{open ? <div className="button-row"><button className="text-button" onClick={() => onReplaceLog(log)}>Replace</button><button className="text-button danger" disabled={busy} onClick={() => void remove(log)}>Delete</button></div> : <span className="settled-label">Settled</span>}</li>; })}</ul> : <p className="empty-state">Your first log will appear here.</p>}</section>

      <section className="profile-section"><div className="section-heading"><div><h2>{moderator ? "Correction queue" : "Your corrections"}</h2><p>{moderator ? "Review shared catalog changes." : "Moderator review status."}</p></div><span>{corrections.length}</span></div>{corrections.length ? <ul className="correction-list">{corrections.map((item) => <li key={item.id}><div><b>{String(item.proposedChanges.name || "Metadata update")}</b><p>{item.reason}</p><small>{item.status}</small></div>{moderator && item.status === "pending" ? <div className="button-row"><button className="text-button" disabled={busy} onClick={() => void review(item.id, true)}>Approve</button><button className="text-button danger" disabled={busy} onClick={() => void review(item.id, false)}>Reject</button></div> : null}</li>)}</ul> : <p className="empty-state">No correction requests.</p>}</section>
      {message ? <p className="status-message" role="status">{message}</p> : null}
    </div>
  );
}
