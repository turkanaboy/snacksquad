import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { friendlyError } from "../errors";
import { StarRating } from "../components/StarRating";
import {
  getRandomSnack, getSnackReleases, setSnackPreference,
  type BoardEntry, type LeaderboardItem, type RandomSnack, type SnackRelease,
} from "../snackStore";

type Props = {
  client: SupabaseClient;
  board: BoardEntry[];
  leaderboard: LeaderboardItem[];
  currentUserId: string;
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onSearch: (query: string) => void;
  onUpvote: (entry: BoardEntry) => void;
  onOpenProfile: (userId: string) => void;
  onOpenContests: () => void;
  onLoadMore: () => void;
};

const categoryIcons: Record<string, string> = {
  "Grains/Bakery": "▦", Protein: "◆", Dairy: "●", Fruit: "◆", Vegetables: "✦",
  "Candy/Sweets": "✹", "Chips/Savory Snacks": "◒", Beverages: "◉", Other: "•",
};

function ProductImage({ src, name, category }: { src: string | null; name: string; category: string }) {
  const [failed, setFailed] = useState(false);
  return src && !failed
    ? <img className="product-image" src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    : <span className="product-fallback" aria-hidden="true" title={name}>{categoryIcons[category] || categoryIcons.Other}</span>;
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

export function ReleaseTitle({ title, articleUrl }: Pick<SnackRelease, "title" | "articleUrl">) {
  return (
    <h3>
      {articleUrl
        ? <a href={articleUrl} target="_blank" rel="noreferrer">{title}</a>
        : title}
    </h3>
  );
}

export function HomeScreen({
  client, board, leaderboard, currentUserId, loading, hasMore, loadingMore, onSearch, onUpvote, onOpenProfile, onOpenContests, onLoadMore,
}: Props) {
  const [query, setQuery] = useState("");
  const [randomSnack, setRandomSnack] = useState<RandomSnack | null>(null);
  const [preference, setPreference] = useState<-1 | 1 | null>(null);
  const [randomBusy, setRandomBusy] = useState(false);
  const [randomMessage, setRandomMessage] = useState("");
  const [releases, setReleases] = useState<SnackRelease[]>([]);
  const [releaseError, setReleaseError] = useState("");

  useEffect(() => {
    void getSnackReleases(client).then(setReleases).catch((error) => setReleaseError(friendlyError(error)));
  }, [client]);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch(query);
  }

  async function chooseRandomSnack() {
    setRandomBusy(true);
    setRandomMessage("");
    try {
      const nextSnack = await getRandomSnack(client);
      setRandomSnack(nextSnack);
      setPreference(null);
      if (!nextSnack) setRandomMessage("The snack catalog is empty.");
    } catch (error) {
      setRandomMessage(friendlyError(error));
    } finally {
      setRandomBusy(false);
    }
  }

  async function vote(sentiment: -1 | 1) {
    if (!randomSnack) return;
    setRandomBusy(true);
    try {
      await setSnackPreference(client, randomSnack.id, sentiment);
      setPreference(sentiment);
      setRandomMessage(`${randomSnack.name} was added to your ${sentiment === 1 ? "likes" : "dislikes"}.`);
    } catch (error) {
      setRandomMessage(friendlyError(error));
    } finally {
      setRandomBusy(false);
    }
  }

  return (
    <div className="home-screen">
      <section className="home-main" aria-labelledby="activity-title">
        <form className="quick-log" onSubmit={submit}>
          <label htmlFor="quick-search">What did you snack on?</label>
          <div className="quick-log-row">
            <span className="search-glyph" aria-hidden="true">⌕</span>
            <input id="quick-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the snack catalog" />
            <button className="primary-button" disabled={!query.trim()}><span aria-hidden="true">+</span> Log snack</button>
          </div>
        </form>

        <section className="random-snack" aria-labelledby="random-snack-title">
          <div>
            <p className="section-label">Can’t decide?</p>
            <h2 id="random-snack-title">Choose a random snack for me</h2>
            {randomSnack ? (
              <article className="random-snack-result">
                <ProductImage src={randomSnack.imageUrl} name={randomSnack.name} category={randomSnack.category} />
                <span><b>{randomSnack.name}</b><small>{[randomSnack.brand, randomSnack.category].filter(Boolean).join(" · ")}</small></span>
              </article>
            ) : <p>Pull one idea from the shared catalog.</p>}
          </div>
          <div className="random-snack-actions">
            {randomSnack ? <div className="button-row"><button className="vote-choice like" disabled={randomBusy} aria-label={`Like ${randomSnack.name}`} aria-pressed={preference === 1} onClick={() => void vote(1)}>↑ Like</button><button className="vote-choice dislike" disabled={randomBusy} aria-label={`Dislike ${randomSnack.name}`} aria-pressed={preference === -1} onClick={() => void vote(-1)}>↓ Dislike</button></div> : null}
            <button className="secondary-button" disabled={randomBusy} onClick={() => void chooseRandomSnack()}>{randomBusy ? "Choosing…" : randomSnack ? "Choose another" : "Choose for me"}</button>
          </div>
          {randomMessage ? <p className="random-snack-message" role="status">{randomMessage}</p> : null}
        </section>

        <header className="section-heading">
          <div><h1 id="activity-title">Recent activity</h1><p>Separate check-ins, shared momentum.</p></div>
          <span>{board.length} {board.length === 1 ? "log" : "logs"}</span>
        </header>

        <section className="activity-board" aria-live="polite" aria-busy={loading}>
          {loading ? <p className="empty-state">Loading the squad board…</p> : null}
          {!loading && board.length === 0 ? (
            <div className="empty-state"><b>The board is ready.</b><span>Log the first snack of the day.</span></div>
          ) : null}
          {board.map((entry) => {
            const ownEntry = entry.loggerId === currentUserId;
            return (
              <article className={`activity-row${entry.imageUrl ? "" : " no-image"}`} key={entry.id}>
                <div className="activity-product"><ProductImage src={entry.imageUrl} name={entry.snackName} category={entry.category} /></div>
                <div className="activity-copy">
                  <p><button className="person-link" onClick={() => onOpenProfile(entry.loggerId)}>{entry.loggerName}</button> logged · {timeLabel(entry.loggedAt)}</p>
                  <h2>{entry.snackName}</h2>
                  <span>{entry.category}</span>
                  <div className="feed-ratings">
                    <StarRating rating={entry.posterRating} label={`${ownEntry ? "Your" : `${entry.loggerName}’s`} rating`} />
                    {!ownEntry && entry.viewerRating ? <StarRating rating={entry.viewerRating} label="Your rating" /> : null}
                  </div>
                </div>
                <button
                  className={entry.viewerUpvoted ? "upvote-button voted" : "upvote-button"}
                  onClick={() => onUpvote(entry)}
                  disabled={ownEntry}
                  aria-label={ownEntry ? `You logged ${entry.snackName}` : `${entry.viewerUpvoted ? "Remove upvote from" : "Upvote"} ${entry.snackName}`}
                  aria-pressed={entry.viewerUpvoted}
                  title={ownEntry ? "You cannot upvote your own log" : undefined}
                >
                  <span aria-hidden="true">↑</span><b>{entry.upvoteCount}</b>
                </button>
              </article>
            );
          })}
        </section>
        {hasMore ? <button className="secondary-button feed-more" disabled={loadingMore} onClick={onLoadMore}>{loadingMore ? "Loading…" : "Load older activity"}</button> : null}

        <button className="contest-strip" onClick={onOpenContests}>
          <span><b>Weekly bracket</b><small>See nominations and active matchups</small></span>
          <strong>Open bracket <span aria-hidden="true">→</span></strong>
        </button>
      </section>

      <aside className="home-sidebar">
        <section className="release-feed" aria-labelledby="release-feed-title">
          <header><p className="section-label">Just announced</p><h2 id="release-feed-title">New snack releases</h2><p>Newest first, without the ticker.</p></header>
          {releaseError ? <p className="empty-state" role="alert">{releaseError}</p> : null}
          {!releaseError && releases.length === 0 ? <p className="empty-state">New releases will appear here as they’re added.</p> : null}
          <ul>{releases.map((release) => <li key={release.id}><time dateTime={release.publishedAt}>{dateLabel(release.publishedAt)}</time><ReleaseTitle title={release.title} articleUrl={release.articleUrl} />{release.brand ? <b>{release.brand}</b> : null}{release.summary ? <p>{release.summary}</p> : null}{release.articleUrl ? <a href={release.articleUrl} target="_blank" rel="noreferrer">Read announcement <span aria-hidden="true">↗</span></a> : null}</li>)}</ul>
        </section>
        <section className="leaderboard" aria-labelledby="leaderboard-title">
          <header><div><h2 id="leaderboard-title">Top 10 snacks</h2><p>30 days · ranked by upvotes</p></div></header>
          {leaderboard.length === 0 ? <p className="empty-state">Rankings appear after the first upvotes.</p> : null}
          <ol>
            {leaderboard.map((item, index) => (
              <li key={item.snackId}>
                <span className="rank">{index + 1}</span>
                <span className="rank-product" aria-hidden="true">{item.snackName.slice(0, 1)}</span>
                <span className="rank-name"><b>{item.snackName}</b><small>{item.category} · {item.logCount} {item.logCount === 1 ? "log" : "logs"}</small></span>
                <strong title={`${item.upvoteCount} upvotes`}>↑{item.upvoteCount}</strong>
              </li>
            ))}
          </ol>
        </section>
      </aside>
    </div>
  );
}
