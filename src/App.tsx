import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { AppShell, type AppView } from "./components/AppShell";
import { AuthScreen } from "./screens/AuthScreen";
import { ContestsScreen } from "./screens/ContestsScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { LogScreen } from "./screens/LogScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { FantasyScreen } from "./screens/FantasyScreen";
import { getFantasyFeatureState, type FantasyFeatureState } from "./fantasyStore";
import { friendlyError } from "./errors";
import {
  loadMyProfile, loadPublicProfile, loadSession, observeSession, requestMagicLink,
  signOut, updateMyProfile, type Profile, type PublicProfile,
} from "./profile";
import {
  createManualSnack, createSnackLog, getBoard, getLeaderboard, setLogUpvote,
  updateSnackLog, type BoardEntry, type LeaderboardItem, type MySnackLog,
} from "./snackStore";
import { saveSelectedSnack, submitSnackCorrection, type SnackMetadata } from "./snackMetadata";
import { hasSupabaseConfig, supabase } from "./supabaseClient";
import { appViewFromSearch, searchForAppView } from "./appView";

function initialAuthError() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);
  const message = hash.get("error_description") || search.get("error_description");
  return message ? friendlyError(new Error(message)) : "";
}

const requestedLeague = () => {
  const params=new URLSearchParams(window.location.search);
  const league=params.get("league") || "";
  return params.get("view") === "fantasy" && /^[0-9a-f-]{36}$/i.test(league) ? league : "";
};

const magicLinkDestination = () => {
  const destination=new URL(window.location.origin);
  const league=requestedLeague();
  if(league){destination.searchParams.set("view","fantasy");destination.searchParams.set("league",league);}
  return destination.toString();
};

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [view, setView] = useState<AppView>(() => appViewFromSearch(window.location.search));
  const [board, setBoard] = useState<BoardEntry[]>([]);
  const [hasMoreBoard, setHasMoreBoard] = useState(false);
  const [loadingMoreBoard, setLoadingMoreBoard] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [logQuery, setLogQuery] = useState("");
  const [editingLog, setEditingLog] = useState<MySnackLog | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [fantasyFeature, setFantasyFeature] = useState<FantasyFeatureState>({ enabled:false,weeksObserved:0,dailyActiveUsers:0,fullBracketParticipation:false,weeklyUserGrowth:false,averageLogsPerUserWeek:0 });

  const refreshCore = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const [nextBoard, nextLeaderboard] = await Promise.all([getBoard(supabase), getLeaderboard(supabase)]);
      setBoard(nextBoard);
      setHasMoreBoard(nextBoard.length === 30);
      setLeaderboard(nextLeaderboard);
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  async function loadMoreBoard() {
    const before = board.at(-1)?.loggedAt;
    if (!before || loadingMoreBoard) return;
    setLoadingMoreBoard(true);
    try {
      const nextBoard = await getBoard(client, 30, before);
      setBoard((current) => {
        const knownIds = new Set(current.map((entry) => entry.id));
        return [...current, ...nextBoard.filter((entry) => !knownIds.has(entry.id))];
      });
      setHasMoreBoard(nextBoard.length === 30);
    } catch (error) {
      setNotice(friendlyError(error));
    } finally {
      setLoadingMoreBoard(false);
    }
  }

  useEffect(() => {
    if (!supabase) return;
    void loadSession(supabase).then(setSession).catch((error) => {
      setNotice(friendlyError(error));
      setSession(null);
    });
    return observeSession(supabase, setSession);
  }, []);

  useEffect(() => {
    const nextSearch = searchForAppView(window.location.search, view);
    if (nextSearch === window.location.search) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${nextSearch}${window.location.hash}`);
  }, [view]);

  useEffect(() => {
    if (!supabase || !session) {
      setProfile(null);
      return;
    }
    void Promise.all([loadMyProfile(supabase), refreshCore(), getFantasyFeatureState(supabase)])
      .then(([nextProfile,,nextFantasy]) => { setProfile(nextProfile); setFantasyFeature(nextFantasy); })
      .catch((error) => setNotice(friendlyError(error)));
  }, [session, refreshCore]);

  if (!hasSupabaseConfig || !supabase) {
    return <main className="config-page"><h1>Snack Squad</h1><p role="alert">Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` to `.env.local`.</p></main>;
  }
  const client = supabase;

  if (session === undefined) return <main className="loading-page"><p role="status">Opening Snack Squad…</p></main>;

  if (!session) {
    return <AuthScreen initialError={initialAuthError()} onRequestLink={(email) => requestMagicLink(client, email, magicLinkDestination())} />;
  }

  if (!profile) return <main className="loading-page"><p role="status">Loading your taste file…</p>{notice ? <p role="alert">{notice}</p> : null}</main>;
  const activeSession = session;
  const activeProfile = profile;

  function openLog(query = "") {
    setEditingLog(null);
    setLogQuery(query);
    setView("log");
  }

  async function logSnack(snack: SnackMetadata) {
    const snackId = snack.id || await saveSelectedSnack(client, snack);
    if (editingLog) await updateSnackLog(client, editingLog.id, snackId);
    else await createSnackLog(client, snackId);
    setEditingLog(null);
    setNotice(editingLog ? "Today’s log was replaced." : `${snack.name} was logged.`);
    await refreshCore();
    setView("home");
  }

  async function logManual(name: string, category: string) {
    const snackId = await createManualSnack(client, name, category);
    await logSnack({ id: snackId, name, category });
  }

  async function toggleUpvote(entry: BoardEntry) {
    if (entry.loggerId === activeSession.user.id) return;
    const nextUpvoted = !entry.viewerUpvoted;
    setBoard((current) => current.map((item) => item.id === entry.id ? {
      ...item,
      viewerUpvoted: nextUpvoted,
      upvoteCount: item.upvoteCount + (nextUpvoted ? 1 : -1),
    } : item));
    try {
      await setLogUpvote(client, entry.id, nextUpvoted);
      const nextLeaderboard = await getLeaderboard(client);
      setLeaderboard(nextLeaderboard);
    } catch (error) {
      setBoard((current) => current.map((item) => item.id === entry.id ? entry : item));
      setNotice(friendlyError(error));
    }
  }

  async function openCoworkerProfile(userId: string) {
    if (userId === activeProfile.userId) {
      setPublicProfile(null);
    } else {
      try {
        setPublicProfile(await loadPublicProfile(client, userId));
      } catch (error) {
        setNotice(friendlyError(error));
        return;
      }
    }
    setView("profile");
  }

  function navigate(nextView: AppView) {
    if (nextView === "log") openLog();
    else {
      if (nextView === "profile") setPublicProfile(null);
      setView(nextView);
    }
  }

  return (
    <AppShell
      view={view}
      displayName={activeProfile.displayName}
      email={activeSession.user.email || "Company member"}
      onNavigate={navigate}
      onSignOut={() => void signOut(client)}
      fantasyEnabled={fantasyFeature.enabled}
    >
      {notice ? <div className="global-notice" role="status"><span>{notice}</span><button className="text-button" onClick={() => setNotice("")}>Dismiss</button></div> : null}
      {view === "home" ? (
        <HomeScreen
          board={board}
          leaderboard={leaderboard}
          currentUserId={activeSession.user.id}
          loading={loading}
          hasMore={hasMoreBoard}
          loadingMore={loadingMoreBoard}
          onSearch={openLog}
          onUpvote={(entry) => void toggleUpvote(entry)}
          onOpenProfile={(userId) => void openCoworkerProfile(userId)}
          onOpenContests={() => setView("contests")}
          onLoadMore={() => void loadMoreBoard()}
        />
      ) : null}
      {view === "log" ? (
        <LogScreen
          client={client}
          initialQuery={logQuery}
          replacing={Boolean(editingLog)}
          onLog={logSnack}
          onManualLog={logManual}
          onSuggestCorrection={(snackId, changes, reason) => submitSnackCorrection(client, snackId, changes, reason)}
        />
      ) : null}
      {view === "profile" ? (
        <ProfileScreen
          client={client}
          profile={activeProfile}
          publicProfile={publicProfile}
          leaderboard={leaderboard}
          onBackToMine={() => setPublicProfile(null)}
          onUpdate={async (changes) => setProfile(await updateMyProfile(client, changes))}
          onReplaceLog={(log) => { setEditingLog(log); setLogQuery(log.snackName); setView("log"); }}
          onChanged={refreshCore}
        />
      ) : null}
      {view === "contests" ? (
        <ContestsScreen client={client} currentUserId={activeSession.user.id} />
      ) : null}
      {view === "fantasy" ? <FantasyScreen client={client} currentUserId={activeSession.user.id} feature={fantasyFeature} initialLeagueId={requestedLeague()} /> : null}
    </AppShell>
  );
}
