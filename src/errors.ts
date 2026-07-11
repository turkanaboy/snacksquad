export function friendlyError(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : error && typeof error === "object" && "message" in error && typeof error.message === "string"
      ? error.message
      : String(error || "");
  const lower = message.toLowerCase();
  if (lower.includes("carnegiehighered.com")) return "Use your Carnegie Higher Ed company email.";
  if (lower.includes("expired") || lower.includes("invalid") && lower.includes("link")) {
    return "That magic link is invalid or expired. Request a new one.";
  }
  if (lower.includes("rate limit") || lower.includes("too many requests")) {
    return "Too many attempts. Wait a moment, then try again.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Could not connect to Snack Squad. Check your connection and try again.";
  }
  return message || "Something went sideways.";
}
