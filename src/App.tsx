import { FormEvent, useEffect, useMemo, useState } from "react";
import { hasSupabaseConfig, supabase } from "./supabaseClient";
import { friendlyError } from "./errors";
import { searchSnackMetadata } from "./snackMetadata";
import {
  addComment,
  archiveSnack,
  createSnack,
  deleteComment,
  findExactDuplicate,
  findSimilarDuplicates,
  getSnackBadges,
  getWeekKey,
  getWeeklyBracket,
  listSnacks,
  pickSnackOfTheDay,
  setBracketVote,
  setRating,
  setVote,
  snacksToCsv,
  updateSnack,
  type Snack,
  type SnackComment,
  type SnackInput,
  type BracketVote,
} from "./snackStore";
import { ensureAnonymousProfile, saveDisplayName, saveProfile, type Profile } from "./profile";
import snackCounterHero from "./assets/snack-counter-hero.webp";

const emptySnack: SnackInput = { name: "", category: "", note: "", sourceNote: "", imageUrl: "" };
const exampleSnack = {
  name: "Trader Joe's Peanut Butter Pretzels",
  category: "Crunchy",
  note: "A safe first nomination: salty, snackable, and meeting-friendly.",
};
const bracketVoteKey = `snack-squad-bracket-${getWeekKey()}`;
const weekKey = getWeekKey();

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [snacks, setSnacks] = useState<Snack[]>([]);
  const [snackDraft, setSnackDraft] = useState<SnackInput>(emptySnack);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [editingSnack, setEditingSnack] = useState<string | null>(null);
  const [message, setMessage] = useState("Loading Snack Squad...");
  const [metadataMessage, setMetadataMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sharedBracketVotes, setSharedBracketVotes] = useState<BracketVote[]>([]);
  const [bracketVotes, setBracketVotes] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(bracketVoteKey) || "{}") as Record<string, string>;
    } catch {
      return {};
    }
  });

  const duplicate = useMemo(() => findExactDuplicate(snacks, snackDraft.name), [snacks, snackDraft.name]);
  const similarSnacks = useMemo(
    () => findSimilarDuplicates(snacks, snackDraft.name).filter((snack) => snack.id !== editingSnack && snack.id !== duplicate?.id),
    [duplicate?.id, editingSnack, snackDraft.name, snacks],
  );
  const pickOfTheDay = useMemo(() => pickSnackOfTheDay(snacks), [snacks]);
  const ratedSnacks = useMemo(() => snacks.filter((snack) => snack.personal_rating), [snacks]);
  const badges = useMemo(() => getSnackBadges(snacks), [snacks]);
  const bracket = useMemo(() => getWeeklyBracket(snacks), [snacks]);
  const imagePreview = useMemo(() => {
    const imageUrl = snackDraft.imageUrl ?? "";
    if (!imageUrl.trim()) return null;
    try {
      const url = new URL(imageUrl);
      return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
    } catch {
      return null;
    }
  }, [snackDraft.imageUrl]);

  async function refresh(currentProfile = profile) {
    if (!supabase || !currentProfile) return;
    const result = await listSnacks(supabase, currentProfile.user, showArchived);
    setSnacks(result.snacks);
    setSharedBracketVotes(result.bracketVotes);
  }

  useEffect(() => {
    if (!supabase) {
      setMessage("Add Supabase values to .env.local to use the shared board.");
      return;
    }

    ensureAnonymousProfile(supabase)
      .then(async (nextProfile) => {
        setProfile(nextProfile);
        setDisplayNameDraft(nextProfile.displayName);
        setMessage("");
        await refresh(nextProfile);
      })
      .catch((error: Error) => setMessage(friendlyError(error)));
  }, []);

  async function run(action: () => Promise<void>) {
    try {
      setBusy(true);
      setMessage("");
      await action();
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

  function updateDraft(key: keyof SnackInput, value: string) {
    setSnackDraft((draft) => ({ ...draft, [key]: value }));
  }

  async function fillMetadata() {
    await run(async () => {
      setMetadataMessage("");
      const [match] = await searchSnackMetadata(snackDraft.name);
      if (!match) {
        setMetadataMessage("No snack metadata match yet.");
        return;
      }
      setSnackDraft((draft) => ({
        ...draft,
        name: match.name || draft.name,
        category: match.category || match.brand || draft.category,
        imageUrl: match.imageUrl || draft.imageUrl,
        sourceNote: match.sourceUrl ? `Open Food Facts: ${match.sourceUrl}` : draft.sourceNote,
      }));
      setMetadataMessage("Snack metadata filled. Review before saving.");
    });
  }

  async function submitSnack(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !profile) return;
    const client = supabase;
    if (duplicate && duplicate.id !== editingSnack) {
      setMessage(`Looks like "${duplicate.name}" is already here. Vote or comment there instead.`);
      return;
    }

    await run(async () => {
      if (editingSnack) {
        await updateSnack(client, editingSnack, snackDraft);
      } else {
        await createSnack(client, profile.user, profile.displayName, snackDraft);
      }
      setSnackDraft(emptySnack);
      setEditingSnack(null);
      await refresh();
    });
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    if (!profile || !supabase) return;
    const client = supabase;
    const displayName = saveDisplayName(displayNameDraft);
    await run(async () => {
      await saveProfile(client, profile.user, displayName);
      setProfile({ ...profile, displayName });
      setDisplayNameDraft(displayName);
    });
  }

  function startEdit(snack: Snack) {
    setEditingSnack(snack.id);
    setSnackDraft({
      name: snack.name,
      category: snack.category ?? "",
      note: snack.note ?? "",
      sourceNote: snack.source_note ?? "",
      imageUrl: snack.image_url ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function voteFor(snack: Snack) {
    if (!supabase || !profile) return;
    const client = supabase;
    await run(async () => {
      await setVote(client, snack.id, profile.user, 1);
      await refresh();
    });
  }

  async function rateSnack(snack: Snack, rating: number) {
    if (!supabase || !profile) return;
    const client = supabase;
    await run(async () => {
      await setRating(client, snack.id, profile.user, rating);
      await refresh();
    });
  }

  async function removeSnack(snack: Snack) {
    if (!supabase) return;
    const client = supabase;
    await run(async () => {
      await archiveSnack(client, snack.id);
      await refresh();
    });
  }

  async function submitComment(event: FormEvent, snack: Snack) {
    event.preventDefault();
    if (!supabase || !profile) return;
    const client = supabase;
    await run(async () => {
      await addComment(client, snack.id, profile.user, profile.displayName, comments[snack.id] || "");
      setComments((draft) => ({ ...draft, [snack.id]: "" }));
      await refresh();
    });
  }

  async function removeComment(comment: SnackComment) {
    if (!supabase) return;
    const client = supabase;
    await run(async () => {
      await deleteComment(client, comment.id);
      await refresh();
    });
  }

  function exportSnacks() {
    const url = URL.createObjectURL(new Blob([snacksToCsv(snacks)], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "snack-squad.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function voteBracket(matchKey: string, snackId: string) {
    const nextVotes = { ...bracketVotes, [matchKey]: snackId };
    setBracketVotes(nextVotes);
    localStorage.setItem(bracketVoteKey, JSON.stringify(nextVotes));
    if (!supabase || !profile) return;
    const client = supabase;
    await run(async () => {
      await setBracketVote(client, weekKey, matchKey, snackId, profile.user);
      await refresh();
    });
  }

  useEffect(() => {
    if (profile) void refresh(profile);
  }, [showArchived]);

  return (
    <main className="app-shell">
      <a className="skip-link" href="#counter">Skip to the snack counter</a>

      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Snack Squad home">
          <span>SNACK</span><b>/</b><span>SQUAD</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#counter">Counter</a>
          <a href="#suggest">Suggest</a>
          <a href="#clubhouse">Clubhouse</a>
        </nav>
        <form className="profile" onSubmit={saveName}>
          <label htmlFor="display-name">Taster name</label>
          <div>
            <input
              id="display-name"
              value={displayNameDraft}
              onChange={(event) => setDisplayNameDraft(event.target.value)}
              placeholder="Your name"
              disabled={!profile}
            />
            <button disabled={!profile || busy}>Set</button>
          </div>
        </form>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="kicker">Remote office snack board</p>
          <h1>Good snacks.<br /><span>Loud opinions.</span></h1>
          <p className="hero-intro">Pitch a favorite, back the good stuff, and keep every questionable take on the record.</p>
          <a className="cta" href="#suggest">Put one up</a>
        </div>
        <figure className="hero-art">
          <img src={snackCounterHero} alt="Chips, pretzels, candy, popcorn, and chocolate arranged on a graphic red and charcoal surface" />
          <figcaption>
            <span><b>{snacks.length}</b> on the counter</span>
            <span><b>{weekKey.slice(5)}</b> weekly bracket</span>
          </figcaption>
        </figure>
      </section>

      {message ? <p className="notice" role="status">{message}</p> : null}

      <section className="clubhouse" id="clubhouse" aria-label="Snack Squad clubhouse">
        {pickOfTheDay ? (
          <article className="club-card daily-pick">
            <p className="club-label">Counter pick</p>
            <h2>{pickOfTheDay.name}</h2>
            <p>{pickOfTheDay.category || "Snack"}, nominated by {pickOfTheDay.display_name}</p>
          </article>
        ) : (
          <article className="club-card daily-pick clubhouse-empty">
            <p className="club-label">Counter pick</p>
            <h2>Today&apos;s spot is open.</h2>
            <p>The first nomination starts the rotation.</p>
          </article>
        )}

        {bracket.length > 0 ? (
          <section className="club-card bracket">
            <div className="club-heading">
              <p className="club-label">Weekly face-off</p>
              <h2>Choose your side</h2>
            </div>
            {bracket.map((match, index) => {
              const matchKey = `${match.left.id}-${match.right?.id ?? "bye"}`;
              const votedFor = bracketVotes[matchKey];
              const contenders = match.right ? [match.left, match.right] : [match.left];
              return (
                <div key={matchKey} className="bracket-match">
                  {contenders.map((snack) => (
                    <button
                      key={snack.id}
                      className={votedFor === snack.id ? "bracket-pick" : "ghost"}
                      onClick={() => voteBracket(matchKey, snack.id)}
                    >
                      <span>{snack.name}</span>
                      <b>{sharedBracketVotes.filter((vote) => vote.match_key === matchKey && vote.snack_id === snack.id).length}</b>
                    </button>
                  ))}
                  {!match.right ? <span className="bye-note">Match {index + 1}: automatic advance</span> : null}
                </div>
              );
            })}
          </section>
        ) : (
          <section className="club-card bracket clubhouse-empty">
            <p className="club-label">Weekly face-off</p>
            <h2>The bracket needs contenders.</h2>
            <p>Add a few snacks and the matchups will build themselves.</p>
          </section>
        )}

        <section className="club-card personal-log">
          <p className="club-label">Your taste file</p>
          {ratedSnacks.length > 0 ? ratedSnacks.map((snack) => (
            <p key={snack.id} className="log-row">
              <span>{snack.name}</span>
              <b>{snack.personal_rating}/5</b>
            </p>
          )) : (
            <div className="clubhouse-empty">
              <h2>No ratings yet.</h2>
              <p>Rate something on the counter to start your log.</p>
            </div>
          )}
          {badges.length > 0 ? (
            <div className="badge-list">
              {badges.map((badge) => (
                <p key={badge.label} className="log-row">
                  <span>{badge.label}</span>
                  <b>{badge.snack.name}</b>
                </p>
              ))}
            </div>
          ) : null}
        </section>
      </section>

      <section className="workspace">
        <aside className="suggestion-rail">
          <form className="submit-card" id="suggest" onSubmit={submitSnack}>
            <div className="form-heading">
              <p className="kicker">New nomination</p>
              <h2>{editingSnack ? "Tune the pitch" : "Pitch your snack"}</h2>
              <p>Names get attention. A sharp reason gets votes.</p>
            </div>
            <label>
              Snack name
              <input
                value={snackDraft.name}
                onChange={(event) => updateDraft("name", event.target.value)}
                placeholder="Cool Ranch Doritos"
                required
              />
            </label>
            <label>
              Category
              <input
                value={snackDraft.category}
                onChange={(event) => updateDraft("category", event.target.value)}
                placeholder="Crunchy, sweet, spicy..."
              />
            </label>
            <button type="button" className="utility-button" onClick={fillMetadata} disabled={!snackDraft.name || busy}>
              Find snack info
            </button>
            {metadataMessage ? <p className="source-note">{metadataMessage}</p> : null}
            <label>
              Image URL
              <input
                type="url"
                value={snackDraft.imageUrl}
                onChange={(event) => updateDraft("imageUrl", event.target.value)}
                placeholder="https://..."
              />
            </label>
            {snackDraft.imageUrl && !imagePreview ? <p className="duplicate">Use a full http or https image URL.</p> : null}
            {imagePreview ? <img className="image-preview" src={imagePreview} alt={`Preview for ${snackDraft.name || "new snack"}`} /> : null}
            <label>
              Pitch
              <textarea
                value={snackDraft.note}
                onChange={(event) => updateDraft("note", event.target.value)}
                placeholder="Why does this belong in snack lore?"
              />
            </label>
            <label>
              Source note
              <input
                value={snackDraft.sourceNote}
                onChange={(event) => updateDraft("sourceNote", event.target.value)}
                placeholder="Copied from #snacks, meeting idea..."
              />
            </label>
            {duplicate && duplicate.id !== editingSnack ? (
              <p className="duplicate">Looks like "{duplicate.name}" is already on the board.</p>
            ) : null}
            {!duplicate && similarSnacks.length > 0 ? (
              <p className="duplicate">Similar snacks: {similarSnacks.map((snack) => snack.name).join(", ")}</p>
            ) : null}
            <div className="actions">
              <button disabled={!profile || !hasSupabaseConfig || busy}>{editingSnack ? "Save changes" : "Add to counter"}</button>
              {editingSnack ? (
                <button type="button" className="ghost" onClick={() => { setEditingSnack(null); setSnackDraft(emptySnack); }}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </aside>

        <section className="counter" id="counter" aria-live="polite">
          <div className="counter-head">
            <div>
              <p className="counter-count">{snacks.length.toString().padStart(2, "0")}</p>
              <h2>{showArchived ? "The archive" : "The snack counter"}</h2>
            </div>
            <div className="actions counter-tools">
              <button className="ghost" onClick={() => exportSnacks()} disabled={snacks.length === 0}>Export</button>
              <button className="ghost" onClick={() => setShowArchived((value) => !value)} disabled={!profile || busy}>
                {showArchived ? "Active" : "Archive"}
              </button>
              <button className="ghost" onClick={() => run(() => refresh())} disabled={!profile || busy}>Refresh</button>
            </div>
          </div>

          {snacks.length === 0 ? (
            <article className="snack-card example-card">
              <div className="snack-image"><span>?</span></div>
              <div className="snack-body">
                <div className="snack-title">
                  <div>
                    <p className="snack-meta">{exampleSnack.category} example</p>
                    <h3>{exampleSnack.name}</h3>
                  </div>
                  <strong title="0 votes"><span>0</span> votes</strong>
                </div>
                <p>{exampleSnack.note}</p>
                <button
                  className="ghost"
                  onClick={() => setSnackDraft({ ...exampleSnack, imageUrl: "" })}
                  disabled={!profile || busy}
                >
                  Use this pitch
                </button>
              </div>
            </article>
          ) : null}

          {snacks.map((snack) => {
            const owned = profile?.user.id === snack.created_by;
            return (
              <article key={snack.id} className={snack.archived ? "snack-card archived-card" : "snack-card"}>
                {snack.image_url ? (
                  <img src={snack.image_url} alt={`Packaging or product photo for ${snack.name}`} />
                ) : (
                  <div className="snack-image"><span>{snack.name.slice(0, 1)}</span></div>
                )}
                <div className="snack-body">
                  <div className="snack-title">
                    <div>
                      <p className="snack-meta">{snack.archived ? "Archived" : snack.category || "Snack"} by {snack.display_name}</p>
                      <h3>{snack.name}</h3>
                    </div>
                    <strong title={`${snack.score ?? 0} votes`}><span>{snack.score ?? 0}</span> votes</strong>
                  </div>
                  {snack.note ? <p className="snack-pitch">{snack.note}</p> : null}
                  {snack.source_note ? <p className="source-note">Source: {snack.source_note}</p> : null}
                  {!snack.archived ? (
                    <>
                      <div className="snack-controls">
                        <button className="vote-button" onClick={() => voteFor(snack)} disabled={!profile || busy}>Back this snack</button>
                        <label className="rating-row">
                          <span>My rating</span>
                          <select
                            value={snack.personal_rating ?? ""}
                            onChange={(event) => rateSnack(snack, Number(event.target.value))}
                            disabled={!profile || busy}
                          >
                            <option value="" disabled>Rate</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                          </select>
                        </label>
                        {owned ? (
                          <div className="owner-actions">
                            <button className="ghost" onClick={() => startEdit(snack)}>Edit</button>
                            <button className="ghost danger" onClick={() => removeSnack(snack)}>Archive</button>
                          </div>
                        ) : null}
                      </div>
                      <form className="comment-form" onSubmit={(event) => submitComment(event, snack)}>
                        <label className="sr-only" htmlFor={`comment-${snack.id}`}>Comment on {snack.name}</label>
                        <input
                          id={`comment-${snack.id}`}
                          value={comments[snack.id] || ""}
                          onChange={(event) => setComments((draft) => ({ ...draft, [snack.id]: event.target.value }))}
                          placeholder="Add your take"
                        />
                        <button disabled={!profile || busy}>Post</button>
                      </form>
                    </>
                  ) : null}
                  {(snack.comments ?? []).length > 0 ? (
                    <div className="comments">
                      {(snack.comments ?? []).map((comment) => (
                        <p key={comment.id}>
                          <b>{comment.display_name}</b><span>{comment.body}</span>
                          {profile?.user.id === comment.created_by ? (
                            <button className="link-button" onClick={() => removeComment(comment)}>Delete</button>
                          ) : null}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      </section>

      <footer>
        <p>Snack Squad keeps the office snack argument where everyone can see it.</p>
        <a href="#top">Back to top</a>
      </footer>
    </main>
  );
}
