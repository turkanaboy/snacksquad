import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseSnackSearch, type SnackMetadata } from "../snackMetadata";

const categories = [
  "Grains/Bakery", "Protein", "Dairy", "Fruit", "Vegetables", "Candy/Sweets",
  "Chips/Savory Snacks", "Beverages", "Other",
];

type Props = {
  client: SupabaseClient;
  initialQuery: string;
  replacing?: boolean;
  onLog: (snack: SnackMetadata) => Promise<void>;
  onManualLog: (name: string, category: string) => Promise<void>;
  onSuggestCorrection: (snackId: string, name: string, reason: string) => Promise<void>;
};

export function LogScreen({ client, initialQuery, replacing = false, onLog, onManualLog, onSuggestCorrection }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SnackMetadata[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [searchError, setSearchError] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [manualName, setManualName] = useState(initialQuery);
  const [manualCategory, setManualCategory] = useState("Other");
  const [correction, setCorrection] = useState<SnackMetadata | null>(null);
  const [correctionName, setCorrectionName] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [message, setMessage] = useState("");

  const search = useMemo(() => createSupabaseSnackSearch(
    client,
    (_currentQuery, products) => {
      setResults(products);
      setSearchError("");
    },
    () => {
      setSearching(false);
      setSearchError("Live product search is temporarily unavailable. You can still log this snack manually below or search by barcode.");
    },
  ), [client]);

  useEffect(() => () => search.dispose(), [search]);

  useEffect(() => {
    setManualName(query);
    setSearchedQuery("");
    void search.search(query);
  }, [query, search]);

  async function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 3) return;
    setSearching(true);
    setSearchedQuery(query.trim());
    setSearchError("");
    await search.searchRemote(query);
    setSearching(false);
  }

  async function log(snack: SnackMetadata, key: string) {
    setBusyKey(key);
    setMessage("");
    try {
      await onLog(snack);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not log that snack.");
    } finally {
      setBusyKey("");
    }
  }

  async function submitManual(event: FormEvent) {
    event.preventDefault();
    setBusyKey("manual");
    setMessage("");
    try {
      await onManualLog(manualName, manualCategory);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add that snack.");
    } finally {
      setBusyKey("");
    }
  }

  async function submitCorrection(event: FormEvent) {
    event.preventDefault();
    if (!correction?.id) return;
    setBusyKey("correction");
    try {
      await onSuggestCorrection(correction.id, correctionName, correctionReason);
      setMessage("Correction sent to a Snack Squad moderator.");
      setCorrection(null);
      setCorrectionReason("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit the correction.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <div className="screen-column log-screen">
      <header className="screen-header">
        <p className="section-label">{replacing ? "Same-day edit" : "Daily check-in"}</p>
        <h1>{replacing ? "Replace today’s snack" : "Log a snack"}</h1>
        <p>{replacing ? "Choose the corrected snack. Existing unsettled reactions will be removed." : "Choose the product once. Snack Squad handles the score and shared board."}</p>
      </header>

      <section className="catalog-search" aria-labelledby="catalog-title">
        <h2 id="catalog-title">Find your snack</h2>
        <form className="search-field" onSubmit={submitSearch}>
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            aria-label="Brand, product, or barcode"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Brand, product, or barcode"
            autoFocus
          />
          <button className="primary-button compact" disabled={searching || query.trim().length < 3}>{searching ? "Searching…" : "Search"}</button>
        </form>
        {searching ? <p className="search-status" role="status">Searching products…</p> : null}
        {searchError ? <p className="warning-message" role="status">{searchError}</p> : null}
        <div id="snack-results" className="search-results" aria-live="polite" aria-label="Snack results">
          {results.map((snack, index) => {
            const key = snack.id || snack.barcode || `${snack.name}-${index}`;
            return (
              <article className="search-result" key={key}>
                <span className="result-image" aria-hidden="true">
                  {snack.imageUrl ? <img src={snack.imageUrl} alt="" onError={(event) => { event.currentTarget.hidden = true; }} /> : snack.name.slice(0, 1)}
                </span>
                <span><b>{snack.name}</b><small>{[snack.brand, snack.category || "Other"].filter(Boolean).join(" · ")}</small></span>
                <button className="primary-button compact" onClick={() => log(snack, key)} disabled={Boolean(busyKey)}>
                  {busyKey === key ? "Saving…" : replacing ? "Use this" : "Log it"}
                </button>
                {snack.id ? (
                  <button className="text-button" onClick={() => {
                    setCorrection(snack);
                    setCorrectionName(snack.name);
                    setCorrectionReason("");
                  }}>Suggest correction</button>
                ) : null}
              </article>
            );
          })}
          {!searching && searchedQuery === query.trim() && results.length === 0 ? (
            <p className="empty-state">
              {searchError ? `Enter “${query.trim()}” below to log it manually.` : "No catalog match yet. Add it manually below."}
            </p>
          ) : null}
        </div>
      </section>

      <form className="manual-entry" onSubmit={submitManual}>
        <div><h2>Not in the catalog?</h2><p>Manual snacks still count; nutrition awards wait for verification.</p></div>
        <label>Snack name<input value={manualName} onChange={(event) => setManualName(event.target.value)} required /></label>
        <label>Category<select value={manualCategory} onChange={(event) => setManualCategory(event.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <button className="secondary-button" disabled={Boolean(busyKey)}>{busyKey === "manual" ? "Adding…" : replacing ? "Add and use" : "Add and log"}</button>
      </form>

      {correction?.id ? (
        <form className="correction-form" onSubmit={submitCorrection}>
          <div><p className="section-label">Catalog correction</p><h2>{correction.name}</h2></div>
          <label>Corrected name<input value={correctionName} onChange={(event) => setCorrectionName(event.target.value)} required /></label>
          <label>What changed?<textarea value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} required /></label>
          <div className="button-row"><button className="primary-button" disabled={busyKey === "correction"}>Send correction</button><button type="button" className="text-button" onClick={() => setCorrection(null)}>Cancel</button></div>
        </form>
      ) : null}
      {message ? <p className={message.includes("sent") ? "success-message" : "error-message"} role="status">{message}</p> : null}
    </div>
  );
}
