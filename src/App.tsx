import { FormEvent, useEffect, useMemo, useState } from "react";
import { hasSupabaseConfig, supabase } from "./supabaseClient";
import { friendlyError } from "./errors";
import {
  addComment,
  archiveSnack,
  createSnack,
  deleteComment,
  findExactDuplicate,
  listSnacks,
  setVote,
  updateSnack,
  type Snack,
  type SnackComment,
  type SnackInput,
} from "./snackStore";
import { ensureAnonymousProfile, saveDisplayName, saveProfile, type Profile } from "./profile";

const emptySnack: SnackInput = { name: "", category: "", note: "", imageUrl: "" };
const exampleSnack = {
  name: "Trader Joe's Peanut Butter Pretzels",
  category: "Crunchy",
  note: "A safe first nomination: salty, snackable, and meeting-friendly.",
};

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [snacks, setSnacks] = useState<Snack[]>([]);
  const [snackDraft, setSnackDraft] = useState<SnackInput>(emptySnack);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [editingSnack, setEditingSnack] = useState<string | null>(null);
  const [message, setMessage] = useState("Loading Snack Squad...");
  const [busy, setBusy] = useState(false);

  const duplicate = useMemo(() => findExactDuplicate(snacks, snackDraft.name), [snacks, snackDraft.name]);

  async function refresh(currentProfile = profile) {
    if (!supabase || !currentProfile) return;
    const nextSnacks = await listSnacks(supabase, currentProfile.user);
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
          <label>
            Pitch
            <textarea
              value={snackDraft.note}
              onChange={(event) => updateDraft("note", event.target.value)}
              placeholder="Why does this belong in snack lore?"
            />
          </label>
          {duplicate && duplicate.id !== editingSnack ? (
            <p className="duplicate">Looks like "{duplicate.name}" is already on the board.</p>
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
            <button className="ghost" onClick={() => run(() => refresh())} disabled={!profile || busy}>
              Refresh
            </button>
          </div>
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
              <article key={snack.id} className="snack-card">
                {snack.image_url ? <img src={snack.image_url} alt="" /> : <div className="snack-image">{snack.name.slice(0, 1)}</div>}
                <div className="snack-body">
                  <div className="snack-title">
                    <div>
                      <h3>{snack.name}</h3>
                      <p>{snack.category || "Snack"} by {snack.display_name}</p>
                    </div>
                    <strong>{snack.score ?? 0}</strong>
                  </div>
                  {snack.note ? <p>{snack.note}</p> : null}
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
                  <form className="comment-form" onSubmit={(event) => submitComment(event, snack)}>
                    <input
                      value={comments[snack.id] || ""}
                      onChange={(event) => setComments((draft) => ({ ...draft, [snack.id]: event.target.value }))}
                      placeholder="Add a snack take"
                    />
                    <button disabled={!profile || busy}>Comment</button>
                  </form>
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
