import { FormEvent, useEffect, useMemo, useState } from "react";
import { hasSupabaseConfig, supabase } from "./supabaseClient";
import { friendlyError } from "./errors";
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
  setRating,
  setVote,
  snacksToCsv,
  updateSnack,
  type Snack,
  type SnackComment,
  type SnackInput,
} from "./snackStore";
import { ensureAnonymousProfile, saveDisplayName, saveProfile, type Profile } from "./profile";

const emptySnack: SnackInput = { name: "", category: "", note: "", sourceNote: "", imageUrl: "" };
const exampleSnack = {
  name: "Trader Joe's Peanut Butter Pretzels",
  category: "Crunchy",
  note: "A safe first nomination: salty, snackable, and meeting-friendly.",
};
const bracketVoteKey = `snack-squad-bracket-${getWeekKey()}`;

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [snacks, setSnacks] = useState<Snack[]>([]);
  const [snackDraft, setSnackDraft] = useState<SnackInput>(emptySnack);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [editingSnack, setEditingSnack] = useState<string | null>(null);
  const [message, setMessage] = useState("Loading Snack Squad...");
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
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
    const nextSnacks = await listSnacks(supabase, currentProfile.user, showArchived);
    setSnacks(nextSnacks);
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

  function voteBracket(matchKey: string, snackId: string) {
    const nextVotes = { ...bracketVotes, [matchKey]: snackId };
    setBracketVotes(nextVotes);
    localStorage.setItem(bracketVoteKey, JSON.stringify(nextVotes));
  }

  useEffect(() => {
    if (profile) void refresh(profile);
  }, [showArchived]);

  return (
    <main className="shell">
      <section className="masthead">
        <div>
          <p className="eyebrow">Remote office snack board</p>
          <h1>Snack Squad</h1>
          <p>Suggest snacks, vote for favorites, and keep the snack debate out of vanishing threads.</p>
        </div>
        <form className="profile" onSubmit={saveName}>
          <label htmlFor="display-name">Display name</label>
          <div>
            <input
              id="display-name"
              value={displayNameDraft}
              onChange={(event) => setDisplayNameDraft(event.target.value)}
              disabled={!profile}
            />
            <button disabled={!profile || busy}>Save</button>
          </div>
        </form>
      </section>

      {message ? <p className="notice">{message}</p> : null}

      <section className="board">
        <form className="submit-card" onSubmit={submitSnack}>
          <h2>{editingSnack ? "Tune up this snack" : "Suggest a snack"}</h2>
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
          {imagePreview ? <img className="image-preview" src={imagePreview} alt="" /> : null}
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
            <p className="duplicate">
              Similar snacks: {similarSnacks.map((snack) => snack.name).join(", ")}
            </p>
          ) : null}
          <div className="actions">
            <button disabled={!profile || !hasSupabaseConfig || busy}>{editingSnack ? "Save snack" : "Add snack"}</button>
            {editingSnack ? (
              <button type="button" className="ghost" onClick={() => { setEditingSnack(null); setSnackDraft(emptySnack); }}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>

        <section className="snack-list" aria-live="polite">
          <div className="list-head">
            <h2>Snack board</h2>
            <div className="actions">
              <button className="ghost" onClick={() => exportSnacks()} disabled={snacks.length === 0}>
                Export CSV
              </button>
              <button className="ghost" onClick={() => setShowArchived((value) => !value)} disabled={!profile || busy}>
                {showArchived ? "Active only" : "Show archive"}
              </button>
              <button className="ghost" onClick={() => run(() => refresh())} disabled={!profile || busy}>
                Refresh
              </button>
            </div>
          </div>
          {pickOfTheDay ? (
            <article className="pick-card">
              <p className="eyebrow">Pick of the day</p>
              <h3>{pickOfTheDay.name}</h3>
              <p>{pickOfTheDay.category || "Snack"} by {pickOfTheDay.display_name}</p>
            </article>
          ) : null}
          {badges.length > 0 ? (
            <section className="pick-card badge-list">
              <p className="eyebrow">Badges</p>
              {badges.map((badge) => (
                <p key={badge.label} className="log-row">
                  <span>{badge.label}</span>
                  <b>{badge.snack.name}</b>
                </p>
              ))}
            </section>
          ) : null}
          {bracket.length > 0 ? (
            <section className="pick-card bracket">
              <p className="eyebrow">Weekly bracket</p>
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
                        {snack.name}
                      </button>
                    ))}
                    {!match.right ? <span>Match {index + 1}: bye week</span> : null}
                  </div>
                );
              })}
            </section>
          ) : null}
          {ratedSnacks.length > 0 ? (
            <section className="pick-card">
              <p className="eyebrow">My snack log</p>
              {ratedSnacks.map((snack) => (
                <p key={snack.id} className="log-row">
                  <span>{snack.name}</span>
                  <b>{snack.personal_rating}/5</b>
                </p>
              ))}
            </section>
          ) : null}
          {snacks.length === 0 ? (
            <article className="snack-card example-card">
              <div className="snack-image">?</div>
              <div className="snack-body">
                <div className="snack-title">
                  <div>
                    <h3>{exampleSnack.name}</h3>
                    <p>{exampleSnack.category} example</p>
                  </div>
                  <strong>0</strong>
                </div>
                <p>{exampleSnack.note}</p>
                <button
                  className="ghost"
                  onClick={() => setSnackDraft({ ...exampleSnack, imageUrl: "" })}
                  disabled={!profile || busy}
                >
                  Use example
                </button>
              </div>
            </article>
          ) : null}
          {snacks.map((snack) => {
            const owned = profile?.user.id === snack.created_by;
            return (
              <article key={snack.id} className={snack.archived ? "snack-card archived-card" : "snack-card"}>
                {snack.image_url ? <img src={snack.image_url} alt="" /> : <div className="snack-image">{snack.name.slice(0, 1)}</div>}
                <div className="snack-body">
                  <div className="snack-title">
                    <div>
                      <h3>{snack.name}</h3>
                      <p>{snack.archived ? "Archived" : snack.category || "Snack"} by {snack.display_name}</p>
                    </div>
                    <strong>{snack.score ?? 0}</strong>
                  </div>
                  {snack.note ? <p>{snack.note}</p> : null}
                  {snack.source_note ? <p className="source-note">{snack.source_note}</p> : null}
                  {!snack.archived ? (
                    <>
                      <div className="actions">
                        <button onClick={() => voteFor(snack)} disabled={!profile || busy}>
                          Vote
                        </button>
                        {owned ? (
                          <>
                            <button className="ghost" onClick={() => startEdit(snack)}>Edit</button>
                            <button className="ghost danger" onClick={() => removeSnack(snack)}>
                              Delete
                            </button>
                          </>
                        ) : null}
                      </div>
                      <label className="rating-row">
                        My rating
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
                      <form className="comment-form" onSubmit={(event) => submitComment(event, snack)}>
                        <input
                          value={comments[snack.id] || ""}
                          onChange={(event) => setComments((draft) => ({ ...draft, [snack.id]: event.target.value }))}
                          placeholder="Add a snack take"
                        />
                        <button disabled={!profile || busy}>Comment</button>
                      </form>
                    </>
                  ) : null}
                  <div className="comments">
                    {(snack.comments ?? []).map((comment) => (
                      <p key={comment.id}>
                        <b>{comment.display_name}:</b> {comment.body}
                        {profile?.user.id === comment.created_by ? (
                          <button className="link-button" onClick={() => removeComment(comment)}>
                            Delete
                          </button>
                        ) : null}
                      </p>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </section>
    </main>
  );
}
