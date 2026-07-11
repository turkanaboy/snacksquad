import { useCallback, useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BadgeHistory } from "../components/BadgeHistory";
import { Bracket } from "../components/Bracket";
import {
  castBracketVote, getCurrentContestOverview, getProfileBadges, getWeeklyReports,
  nominateBracketSnack, type BadgeTenure, type ContestMatchup, type ContestOverview, type WeeklyReport,
} from "../contestStore";
import { friendlyError } from "../errors";
import { createSupabaseSnackSearch, saveSelectedSnack, type SnackMetadata } from "../snackMetadata";

type Props = { client: SupabaseClient; currentUserId: string; fantasyEnabled: boolean; onOpenFantasy: () => void };

function weekLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

export function ContestsScreen({ client, currentUserId, fantasyEnabled, onOpenFantasy }: Props) {
  const [overview, setOverview] = useState<ContestOverview | null>(null);
  const [reports, setReports] = useState<WeeklyReport[]>([]);
  const [badges, setBadges] = useState<BadgeTenure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyMatchupId, setBusyMatchupId] = useState("");
  const [nominationQuery, setNominationQuery] = useState("");
  const [nominationResults, setNominationResults] = useState<SnackMetadata[]>([]);
  const [searching, setSearching] = useState(false);
  const [nominating, setNominating] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextOverview, nextReports, nextBadges] = await Promise.all([
        getCurrentContestOverview(client), getWeeklyReports(client), getProfileBadges(client, currentUserId),
      ]);
      setOverview(nextOverview);
      setReports(nextReports);
      setBadges(nextBadges);
      setError("");
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, [client, currentUserId]);

  useEffect(() => { void load(); }, [load]);

  const search = useMemo(() => createSupabaseSnackSearch(
    client,
    (_query, products) => { setNominationResults(products); setSearching(false); },
    400,
    () => { setSearching(false); setError("Catalog search is unavailable right now."); },
  ), [client]);

  useEffect(() => () => search.dispose(), [search]);
  useEffect(() => {
    if (nominationQuery.trim().length < 2) { setNominationResults([]); setSearching(false); return; }
    setSearching(true);
    void search.search(nominationQuery);
  }, [nominationQuery, search]);

  const myEntry = overview?.entries.find((entry) => entry.ownerIds.includes(currentUserId));

  async function nominate(snack: SnackMetadata) {
    if (!overview) return;
    setNominating(snack.id || snack.barcode || snack.name);
    try {
      const snackId = snack.id || await saveSelectedSnack(client, snack);
      await nominateBracketSnack(client, overview.week.id, snackId);
      setNominationQuery("");
      await load();
    } catch (nominationError) {
      setError(friendlyError(nominationError));
    } finally {
      setNominating("");
    }
  }

  async function vote(matchup: ContestMatchup, entryId: string) {
    setBusyMatchupId(matchup.id);
    try {
      await castBracketVote(client, matchup.id, entryId);
      await load();
    } catch (voteError) {
      setError(friendlyError(voteError));
    } finally {
      setBusyMatchupId("");
    }
  }

  return (
    <div className="contest-screen">
      <header className="contest-hero">
        <div><p className="section-label">Weekly competition</p><h1>One snack survives.</h1><p>Nominate once. Vote each weekday. Every co-owner shares the win.</p></div>
        {overview ? <div className="week-stamp"><span>Week of</span><b>{weekLabel(overview.week.weekStart)}</b><small>{overview.week.status.replaceAll("_", " ")}</small></div> : null}
      </header>

      {error ? <div className="error-message" role="alert">{error}</div> : null}
      {loading ? <p className="empty-state" role="status">Loading this week’s bracket…</p> : null}
      {!loading && !overview ? <p className="empty-state">The first contest week has not opened yet.</p> : null}

      {overview?.week.status === "nominations" ? (
        <section className="nomination-desk" aria-labelledby="nomination-title">
          <div className="nomination-copy"><span className="desk-number">01</span><div><h2 id="nomination-title">Your nomination</h2><p>Duplicate picks merge into one entry with shared ownership.</p></div></div>
          {myEntry ? (
            <div className="my-nomination"><span>Nominated</span><b>{myEntry.snackName}</b><small>{myEntry.ownerIds.length > 1 ? `${myEntry.ownerIds.length} co-owners so far` : "You own this entry"}</small></div>
          ) : (
            <div className="nomination-search">
              <label htmlFor="nomination-search">Find a canonical snack</label>
              <input id="nomination-search" type="search" value={nominationQuery} onChange={(event) => setNominationQuery(event.target.value)} placeholder="Brand or product" />
              {searching ? <p role="status">Searching…</p> : null}
              {nominationResults.length ? <ul className="nomination-results" aria-live="polite">{nominationResults.map((snack, index) => {
                const key = snack.id || snack.barcode || `${snack.name}-${index}`;
                return <li key={key}><span><b>{snack.name}</b><small>{snack.category || "Other"}</small></span><button className="primary-button compact" disabled={Boolean(nominating)} onClick={() => void nominate(snack)}>{nominating === key ? "Nominating…" : "Nominate"}</button></li>;
              })}</ul> : null}
            </div>
          )}
        </section>
      ) : null}

      {overview ? (
        <section className="bracket-section" aria-labelledby="bracket-title">
          <div className="section-heading"><div><h2 id="bracket-title">The bracket</h2><p>A fresh round closes at 5:00 PM Eastern each workday.</p></div><span>{overview.entries.length}/16 entries</span></div>
          <Bracket entries={overview.entries} matchups={overview.matchups} viewerVotes={overview.viewerVotes} busyMatchupId={busyMatchupId} onVote={(matchup, entryId) => void vote(matchup, entryId)} />
          {overview.week.championEntryId ? <Champion overview={overview} /> : null}
        </section>
      ) : null}

      <section className="contest-lower-grid">
        <div className="report-panel"><div className="section-heading"><div><h2>Friday reports</h2><p>Frozen weekly results, kept on the record.</p></div></div>{reports.length ? reports.map((report) => <ReportRow key={report.weekId} report={report} />) : <p className="empty-state">The first report publishes Friday.</p>}</div>
        <div className="badge-panel"><div className="section-heading"><div><h2>Your badge tenures</h2><p>Current runs stay open until dethroned.</p></div></div><BadgeHistory badges={badges} /></div>
      </section>

      <section className="fantasy-lock"><span className="desk-number">03</span><div><p className="section-label">Fantasy league</p><h2>{fantasyEnabled ? "The draft room is open." : "Locked for the pilot."}</h2><p>{fantasyEnabled ? "Create or join a private monthly league." : "Fantasy opens only after four weeks of healthy participation."}</p></div><button className={fantasyEnabled ? "primary-button" : "secondary-button"} onClick={onOpenFantasy}>{fantasyEnabled ? "Open fantasy" : "View pilot gate"}</button></section>
    </div>
  );
}

function Champion({ overview }: { overview: ContestOverview }) {
  const champion = overview.entries.find((entry) => entry.id === overview.week.championEntryId);
  if (!champion) return null;
  return <div className="champion-strip"><span>Champion</span><b>{champion.snackName}</b><small>{champion.ownerIds.length ? `${champion.ownerIds.length} badge ${champion.ownerIds.length === 1 ? "recipient" : "recipients"}` : "Leaderboard fill — no owner badge"}</small></div>;
}

function ReportRow({ report }: { report: WeeklyReport }) {
  const leader = report.leaderboard[0];
  return <article className="report-row"><time dateTime={report.reportDate}>{weekLabel(report.reportDate)}</time><span><b>{leader?.snackName || "No activity winner"}</b><small>{leader ? `${leader.upvoteCount} upvotes · ${leader.logCount} logs` : "No qualifying activity"}</small></span><strong>{report.bracketChampionEntryId ? "Bracket final" : "Standings"}</strong></article>;
}
