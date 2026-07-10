import { hasSupabaseConfig } from "./supabaseClient";

export default function App() {
  return (
    <main>
      <h1>Snack Squad</h1>
      <p role="status">
        {hasSupabaseConfig
          ? "Core services are connected. The approved interface is being assembled next."
          : "Add the Supabase values to .env.local to connect Snack Squad."}
      </p>
    </main>
  );
}
