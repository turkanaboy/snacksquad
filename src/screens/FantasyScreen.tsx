import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createFantasyLeague,
  fantasyRosterCategory,
  fantasyTeamSlots,
  getFantasyOverview,
  getMyFantasyLeagues,
  joinFantasyLeague,
  setFantasyPreferences,
  startFantasyDraft,
  submitFantasyPick,
  type FantasyFeatureState,
  type FantasyLeague,
  type FantasyOverview,
} from "../fantasyStore";
import { createSupabaseSnackSearch, saveSelectedSnack, type SnackMetadata } from "../snackMetadata";
import { friendlyError } from "../errors";

type Props = { client: SupabaseClient; currentUserId: string; feature: FantasyFeatureState; initialLeagueId?: string };

export function FantasyScreen({ client, currentUserId, feature, initialLeagueId = "" }: Props) {
  const [leagues, setLeagues] = useState<FantasyLeague[]>([]);
  const [selectedId, setSelectedId] = useState(initialLeagueId);
  const [overview, setOverview] = useState<FantasyOverview | null>(null);
  const [loading, setLoading] = useState(feature.enabled);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [leagueName, setLeagueName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SnackMetadata[]>([]);
  const [preferences, setPreferences] = useState<SnackMetadata[]>([]);

  const load = useCallback(async () => {
    if (!feature.enabled) return;
    try {
      const next = await getMyFantasyLeagues(client);
      setLeagues(next);
      const id = next.some((league) => league.id === selectedId) ? selectedId : next[0]?.id || "";
      setSelectedId(id);
      setOverview(id ? await getFantasyOverview(client, id) : null);
      setLoadFailed(false);
      setError("");
    } catch (loadError) {
      setLoadFailed(true);
      setError(friendlyError(loadError));
    } finally {
      setLoading(false);
    }
  }, [client, feature.enabled, selectedId]);

  useEffect(() => { void load(); }, [load]);

  const search = useMemo(() => createSupabaseSnackSearch(
    client,
    (_searchQuery, items) => setResults(items),
    () => setError("Remote search is unavailable; known snacks still work."),
  ), [client]);

  useEffect(() => () => search.dispose(), [search]);
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    void search.search(query);
  }, [query, search]);

  if (!feature.enabled) return <LockedFantasy feature={feature} />;
  if (loading) return <div className="fantasy-screen"><p className="empty-state" role="status">Opening your fantasy leagues…</p></div>;

  const selectedLeague = leagues.find((league) => league.id === selectedId);
  const season = overview?.season;
  const managers = overview?.draftOrder.length || 0;
  const round = season && managers ? Math.floor((season.currentPick - 1) / managers) + 1 : 0;
  const within = season && managers ? (season.currentPick - 1) % managers + 1 : 0;
  const pickerPosition = round % 2 === 1 ? within : managers - within + 1;
  const pickerId = overview?.draftOrder.find((manager) => manager.position === pickerPosition)?.userId;
  const myTurn = season?.status === "drafting" && pickerId === currentUserId;
  const teamSlots = fantasyTeamSlots(overview?.roster || [], currentUserId);

  async function act(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      setQuery("");
      await load();
    } catch (actionError) {
      setError(friendlyError(actionError));
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      const rows = await createFantasyLeague(client, leagueName);
      setSelectedId(rows[0].league_id);
      setLeagueName("");
    });
  }

  async function join(event: FormEvent) {
    event.preventDefault();
    await act(async () => {
      setSelectedId(await joinFantasyLeague(client, joinCode));
      setJoinCode("");
    });
  }

  async function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 3) return;
    setBusy(true);
    try {
      await search.searchRemote(query);
    } finally {
      setBusy(false);
    }
  }

  async function choose(snack: SnackMetadata, mode: "pick" | "preference") {
    setBusy(true);
    setError("");
    try {
      const id = snack.id || await saveSelectedSnack(client, snack);
      if (mode === "preference") {
        if (!preferences.some((item) => item.id === id)) setPreferences([...preferences, { ...snack, id }]);
        return;
      }
      if (!season) return;
      await submitFantasyPick(client, season.id, id);
      setQuery("");
      await load();
    } catch (actionError) {
      setError(friendlyError(actionError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fantasy-screen">
      <header className="fantasy-hero">
        <p className="section-label">Two-week fantasy</p>
        <h1>Draft your snack shelf.</h1>
        <p>Five categories. Exclusive picks. Everyone else’s activity scores for you.</p>
      </header>
      <FantasyRules />
      {error ? <div className="error-message" role="alert">{error}</div> : null}

      {loadFailed && !leagues.length ? (
        <section className="fantasy-onboarding">
          <div><h2>Fantasy leagues did not load</h2><p>Check your connection, then try again.</p><button className="secondary-button" onClick={() => { setLoading(true); void load(); }}>Retry</button></div>
        </section>
      ) : !leagues.length ? (
        <section className="fantasy-onboarding">
          <form onSubmit={create}><h2>Create a league</h2><label>League name<input value={leagueName} onChange={(event) => setLeagueName(event.target.value)} required /></label><button className="primary-button" disabled={busy}>Create league</button></form>
          <form onSubmit={join}><h2>Join with a code</h2><label>Join code<input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} required /></label><button className="secondary-button" disabled={busy}>Join league</button></form>
        </section>
      ) : (
        <>
          <div className="league-switcher">
            <label>League<select value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{leagues.map((league) => <option value={league.id} key={league.id}>{league.name}</option>)}</select></label>
            {selectedLeague ? <span><b>{selectedLeague.memberCount}/8 managers</b><small>Code {selectedLeague.joinCode}</small></span> : null}
          </div>
          {!season ? (
            <section className="draft-lobby">
              <div><h2>Draft lobby</h2><p>Four managers are required. Missing auto-picks are filled from the private reserve.</p></div>
              {selectedLeague?.isCreator ? <button className="primary-button" disabled={busy || selectedLeague.memberCount < 4} onClick={() => void act(() => startFantasyDraft(client, selectedId))}>Start season</button> : null}
            </section>
          ) : (
            <>
              <section className="draft-status"><span><small>Status</small><b>{season.status}</b></span><span><small>Pick</small><b>{season.currentPick}</b></span><span><small>On the clock</small><b>{overview?.members.find((member) => member.userId === pickerId)?.displayName || "Draft complete"}</b></span><span><small>Deadline</small><b>{season.pickDeadline ? new Date(season.pickDeadline).toLocaleString() : "—"}</b></span></section>
              {season.status === "drafting" ? (
                <section className="draft-room">
                  <div className="draft-board"><h2>Pick history</h2>{overview?.picks.length ? <ol>{overview.picks.map((pick) => <li key={pick.pickNumber}><span>{pick.pickNumber}</span><b>{pick.snackName}</b><small>{overview.members.find((member) => member.userId === pick.userId)?.displayName || "Unknown manager"} · {pick.category}{pick.wasAutoPick ? " · auto-pick" : ""}</small></li>)}</ol> : <p className="empty-state">The first manager is on the clock.</p>}</div>
                  <div className="draft-actions">
                    <div className="my-roster draft-team"><h2>Your current team</h2><ul>{teamSlots.map((slot) => slot.snack ? <li key={slot.category}><span><b>{slot.snack.snackName}</b><small>{slot.category}</small></span></li> : <li className="open-slot" key={slot.category}><span><b>Open</b><small>{slot.category}</small></span></li>)}</ul></div>
                    <h2>{myTurn ? "You’re on the clock" : "Build your auto-pick queue"}</h2>
                    <SearchForm query={query} setQuery={setQuery} busy={busy} submitSearch={submitSearch} />
                    {results.length ? <ul className="fantasy-search">{results.map((snack, index) => {
                      const category = fantasyRosterCategory(snack.category);
                      const slotOpen = category ? teamSlots.some((slot) => slot.category === category && !slot.snack) : false;
                      const action = !category ? "Not eligible" : !slotOpen ? "Slot filled" : myTurn ? "Draft" : "Add to queue";
                      return <li key={snack.id || snack.providerId || snack.barcode || `${snack.name}-${index}`}><span><b>{snack.name}</b><small>{category || snack.category}</small></span><button type="button" className="text-button" disabled={busy || !slotOpen} onClick={() => void choose(snack, myTurn ? "pick" : "preference")}>{action}</button></li>;
                    })}</ul> : null}
                    {preferences.length ? <div className="preference-queue"><h3>Auto-pick order</h3><ol>{preferences.map((snack) => <li key={snack.id}>{snack.name}<button type="button" className="text-button" onClick={() => setPreferences((current) => current.filter((item) => item.id !== snack.id))}>Remove</button></li>)}</ol><button className="secondary-button" disabled={busy} onClick={() => void act(() => setFantasyPreferences(client, season.id, preferences.map((snack) => snack.id!)))}>Save queue</button></div> : null}
                  </div>
                </section>
              ) : <SeasonSummary overview={overview!} currentUserId={currentUserId} isCreator={Boolean(selectedLeague?.isCreator)} busy={busy} onRestart={() => void act(() => startFantasyDraft(client, selectedId))} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function SearchForm({ query, setQuery, busy, submitSearch }: { query: string; setQuery: (value: string) => void; busy: boolean; submitSearch: (event: FormEvent) => Promise<void> }) {
  return <form onSubmit={submitSearch}><label>Search snacks<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label><button className="secondary-button compact" disabled={busy || query.trim().length < 3}>{busy ? "Searching…" : "Search"}</button></form>;
}

function FantasyRules() {
  return <details className="fantasy-rules"><summary><span>How fantasy works</span><small>League, draft, and scoring rules</small></summary><ol>
    <li><h3>Build a league</h3><p>Private leagues have 4–8 managers. Join with the league code; only the creator starts each season.</p></li>
    <li><h3>Draft a shelf</h3><p>Fill one slot each for Grains/Bakery, Fruit, Vegetable, Candy/Chips, and Protein in a randomized snake draft. Each snack belongs to only one manager that season.</p></li>
    <li><h3>Take your turn</h3><p>Each pick gets three business hours, counted from 9 AM–5 PM Eastern on weekdays. Turn and reminder emails keep the draft moving.</p></li>
    <li><h3>Set an auto-pick</h3><p>If time expires, your highest eligible queued snack wins. Otherwise, the best eligible catalog or reserve snack fills the open category.</p></li>
    <li><h3>Score points</h3><p>Scoring starts the first Monday after the draft and runs for two Monday–Friday weeks. Each log or upvote from someone else earns one point; weekends and your own activity do not score.</p></li>
    <li><h3>Win the season</h3><p>Rosters stay fixed during scoring. Every manager tied for first is a Fantasy Champion, and the creator can start the next season after completion.</p></li>
  </ol></details>;
}

function LockedFantasy({ feature }: { feature: FantasyFeatureState }) {
  const metrics = [
    { label: "Pilot weeks", value: `${feature.weeksObserved}/4`, pass: feature.weeksObserved >= 4 },
    { label: "Daily active", value: String(feature.dailyActiveUsers), pass: feature.dailyActiveUsers > 5 },
    { label: "Full bracket", value: feature.fullBracketParticipation ? "Complete" : "Waiting", pass: feature.fullBracketParticipation },
    { label: "User growth", value: feature.weeklyUserGrowth ? "Growing" : "Waiting", pass: feature.weeklyUserGrowth },
    { label: "Logs / week", value: String(feature.averageLogsPerUserWeek), pass: feature.averageLogsPerUserWeek >= 3 },
  ];
  return <div className="fantasy-screen locked-fantasy"><header className="fantasy-hero"><p className="section-label">Fantasy league</p><h1>Earn the unlock.</h1><p>The draft room stays closed until Snack Squad proves four weeks of healthy daily participation.</p></header><FantasyRules /><div className="pilot-meter">{metrics.map((metric) => <div className={metric.pass ? "passed" : ""} key={metric.label}><span>{metric.label}</span><b>{metric.value}</b><small>{metric.pass ? "Ready" : "Not yet"}</small></div>)}</div><p className="lock-note">A moderator reviews these signals before enabling fantasy. The gate never opens automatically.</p></div>;
}

function SeasonSummary({ overview, currentUserId, isCreator, busy, onRestart }: { overview: FantasyOverview; currentUserId: string; isCreator: boolean; busy: boolean; onRestart: () => void }) {
  const mine = fantasyTeamSlots(overview.roster, currentUserId);
  const scheduled = overview.season?.status === "active" && overview.season.scoringStartsAt && new Date(overview.season.scoringStartsAt) > new Date();
  return <section className="active-fantasy"><div className="standings"><h2>{scheduled ? "Scoring starts soon" : overview.season?.status === "complete" ? "Final standings" : "Standings"}</h2>{scheduled ? <p>Season {overview.season?.seasonNumber} begins {new Date(overview.season!.scoringStartsAt!).toLocaleString()}.</p> : <ol>{overview.standings.map((standing, index) => <li key={standing.userId}><span>{index + 1}</span><b>{overview.members.find((member) => member.userId === standing.userId)?.displayName}</b><strong>{standing.points}</strong></li>)}</ol>}{overview.season?.status === "complete" && isCreator ? <button className="primary-button" disabled={busy} onClick={onRestart}>Start next season</button> : null}</div><div className="my-roster"><h2>Your fixed roster</h2><ul>{mine.map((slot) => slot.snack ? <li key={slot.category}><span><b>{slot.snack.snackName}</b><small>{slot.category}</small></span></li> : <li className="open-slot" key={slot.category}><span><b>Open</b><small>{slot.category}</small></span></li>)}</ul><p className="empty-state">Rosters stay fixed through both scoring weeks.</p></div></section>;
}
