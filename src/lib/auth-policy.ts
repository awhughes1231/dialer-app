export function isEmailAllowed(
  email: string | null | undefined,
  options: { domain?: string; allowlist?: string[] },
): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return false;
  if (options.allowlist && options.allowlist.length > 0) {
    return options.allowlist.map((item) => item.toLowerCase()).includes(normalized);
  }
  const domain = (options.domain ?? "ecommercewala.co").toLowerCase();
  return normalized.endsWith(`@${domain}`);
}

export function roleForEmail(email: string, admins: string[]): "ADMIN" | "REP" {
  return admins.map((item) => item.toLowerCase()).includes(email.trim().toLowerCase()) ? "ADMIN" : "REP";
}
