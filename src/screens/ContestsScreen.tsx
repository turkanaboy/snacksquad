import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Bracket } from "../components/Bracket";
import {
  castBracketVote, getBracketArchive, getCurrentContestOverview, nominateBracketSnack,
  type BracketArchive, type ContestMatchup, type ContestOverview,
} from "../contestStore";
import { friendlyError } from "../errors";
import { createSupabaseSnackSearch, saveSelectedSnack, type SnackMetadata } from "../snackMetadata";

type Props = { client: SupabaseClient; currentUserId: string };

function weekLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

export function ContestsScreen({ client, currentUserId }: Props) {
  const [overview, setOverview] = useState<ContestOverview | null>(null);
  const [archive, setArchive] = useState<BracketArchive[]>([]);
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
      const [overviewResult, archiveResult] = await Promise.allSettled([getCurrentContestOverview(client), getBracketArchive(client)]);
      if (overviewResult.status === "rejected") throw overviewResult.reason;
      setOverview(overviewResult.value);
      if (archiveResult.status === "fulfilled") {
        setArchive(archiveResult.value);
        setError("");
      } else {
        setError(`Past bracket winners are unavailable. ${friendlyError(archiveResult.reason)}`);
      }
    } catch (loadError) {
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { void load(); }, [load]);

  const search = useMemo(() => createSupabaseSnackSearch(
    client,
    (_query, products) => { setNominationResults(products); },
    () => { setSearching(false); setError("Catalog search is unavailable right now."); },
  ), [client]);

  useEffect(() => () => search.dispose(), [search]);
  useEffect(() => {
    if (nominationQuery.trim().length < 2) { setNominationResults([]); setSearching(false); return; }
    void search.search(nominationQuery);
  }, [nominationQuery, search]);

  async function submitNominationSearch(event: FormEvent) {
    event.preventDefault();
    if (nominationQuery.trim().length < 3) return;
    setSearching(true);
    await search.searchRemote(nominationQuery);
    setSearching(false);
  }

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
          <div className="nomination-copy"><h2 id="nomination-title">Your nomination</h2><p>Duplicate picks merge into one entry with shared ownership.</p></div>
          {myEntry ? (
            <div className="my-nomination"><span>Nominated</span><b>{myEntry.snackName}</b><small>{myEntry.ownerIds.length > 1 ? `${myEntry.ownerIds.length} co-owners so far` : "You own this entry"}</small></div>
          ) : (
            <div className="nomination-search">
              <form onSubmit={submitNominationSearch}>
                <label htmlFor="nomination-search">Find a canonical snack</label>
                <input id="nomination-search" type="search" value={nominationQuery} onChange={(event) => setNominationQuery(event.target.value)} placeholder="Brand or product" />
                <button className="secondary-button compact" disabled={searching || nominationQuery.trim().length < 3}>{searching ? "Searching…" : "Search"}</button>
              </form>
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

      {archive.length ? <BracketHistory archive={archive} /> : null}
    </div>
  );
}

function Champion({ overview }: { overview: ContestOverview }) {
  const champion = overview.entries.find((entry) => entry.id === overview.week.championEntryId);
  if (!champion) return null;
  return <div className="champion-strip"><span>Champion</span><b>{champion.snackName}</b><small>{champion.ownerIds.length ? `${champion.ownerIds.length} badge ${champion.ownerIds.length === 1 ? "recipient" : "recipients"}` : "Leaderboard fill — no owner badge"}</small></div>;
}

function BracketHistory({ archive }: { archive: BracketArchive[] }) {
  return <section className="bracket-history" aria-labelledby="bracket-history-title"><div className="section-heading"><div><h2 id="bracket-history-title">Past bracket winners</h2><p>Completed weekly podiums, including shared third place for both semifinalists.</p></div><span>{archive.length}</span></div><div className="bracket-history-list">{archive.map((result) => <details key={result.weekId}><summary><span>Week of {weekLabel(result.weekStart)}</span><b>{result.firstPlace.snackName}</b></summary><ol><li><span>1st</span><b>{result.firstPlace.snackName}</b></li><li><span>2nd</span><b>{result.secondPlace.snackName}</b></li><li><span>3rd (tie)</span><b>{result.thirdPlace.map((entry) => entry.snackName).join(" · ")}</b></li></ol></details>)}</div></section>;
}
