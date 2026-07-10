import type { ContestEntry, ContestMatchup } from "../contestStore";

type Props = {
  entries: ContestEntry[];
  matchups: ContestMatchup[];
  viewerVotes: Array<{ matchupId: string; entryId: string }>;
  busyMatchupId: string;
  onVote: (matchup: ContestMatchup, entryId: string) => void;
};

const roundNames: Record<number, string> = { 1: "Round of 16", 2: "Quarterfinals", 3: "Semifinals", 4: "Final" };

function closeLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
}

export function Bracket({ entries, matchups, viewerVotes, busyMatchupId, onVote }: Props) {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  const rounds = [1, 2, 3, 4];

  if (!matchups.length) return <p className="empty-state">The seeded bracket appears when nominations close.</p>;
  return (
    <>
      <nav className="bracket-round-nav" aria-label="Jump to bracket round">
        {rounds.map((round) => <a key={round} href={`#bracket-round-${round}`}>{roundNames[round]}</a>)}
      </nav>
      <div className="bracket-scroll" aria-label="Weekly snack bracket">
      <div className="bracket-grid">
        {rounds.map((round) => (
          <section className="bracket-round" id={`bracket-round-${round}`} key={round} aria-labelledby={`round-${round}`}>
            <header><span>0{round}</span><h3 id={`round-${round}`}>{roundNames[round]}</h3></header>
            <div className="round-matchups">
              {matchups.filter((matchup) => matchup.roundNumber === round).length === 0 ? <p className="round-waiting">Awaiting prior round</p> : null}
              {matchups.filter((matchup) => matchup.roundNumber === round).map((matchup) => {
                const left = entryById.get(matchup.leftEntryId);
                const right = matchup.rightEntryId ? entryById.get(matchup.rightEntryId) : null;
                const viewerVote = viewerVotes.find((vote) => vote.matchupId === matchup.id)?.entryId;
                const open = matchup.status === "open" || matchup.status === "sudden_death";
                return (
                  <article className={`matchup ${matchup.status}`} key={matchup.id} aria-labelledby={`match-${matchup.id}`}>
                    <div className="matchup-status">
                      <b id={`match-${matchup.id}`}>Match {matchup.position}</b>
                      <span>{matchup.status === "sudden_death" ? "Sudden death" : open ? `Closes ${closeLabel(matchup.closesAt)}` : matchup.status}</span>
                    </div>
                    {left ? <EntryChoice entry={left} count={matchup.leftVoteCount} selected={viewerVote === left.id} winner={matchup.winnerEntryId === left.id} disabled={!open || busyMatchupId === matchup.id} onVote={() => onVote(matchup, left.id)} /> : null}
                    {right ? <EntryChoice entry={right} count={matchup.rightVoteCount} selected={viewerVote === right.id} winner={matchup.winnerEntryId === right.id} disabled={!open || busyMatchupId === matchup.id} onVote={() => onVote(matchup, right.id)} /> : <p className="bracket-bye">Awaiting winner</p>}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      </div>
    </>
  );
}

function EntryChoice({ entry, count, selected, winner, disabled, onVote }: {
  entry: ContestEntry; count: number; selected: boolean; winner: boolean; disabled: boolean; onVote: () => void;
}) {
  return (
    <button className={`bracket-choice${selected ? " selected" : ""}${winner ? " winner" : ""}`} disabled={disabled} onClick={onVote} aria-pressed={selected}>
      <span className="seed">{entry.seed || "–"}</span>
      <span className="choice-name"><b>{entry.snackName}</b><small>{entry.ownerIds.length ? `${entry.ownerIds.length} ${entry.ownerIds.length === 1 ? "owner" : "co-owners"}` : "Leaderboard fill"}</small></span>
      <strong>{count}</strong>
    </button>
  );
}
