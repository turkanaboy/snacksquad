import { useState, type FormEvent } from "react";
import type { BoardEntry, LeaderboardItem } from "../snackStore";

type Props = {
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

export function HomeScreen({
  board, leaderboard, currentUserId, loading, hasMore, loadingMore, onSearch, onUpvote, onOpenProfile, onOpenContests, onLoadMore,
}: Props) {
  const [query, setQuery] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch(query);
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

      <aside className="leaderboard" aria-labelledby="leaderboard-title">
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
      </aside>
    </div>
  );
}
