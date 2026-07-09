export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("Anonymous sign-ins are disabled")) {
    return "Supabase anonymous sign-ins are disabled. Enable them in Auth settings so Snack Squad can create no-login profiles.";
  }
  if (message.includes("permission denied for table")) {
    return "Supabase table grants are missing. Run the API grants migration so the app can reach the snack tables.";
  }
  return message || "Something went sideways.";
}
