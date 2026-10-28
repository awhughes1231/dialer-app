/** Change this to the public dialer URL before `twenty app apply`. */
export const DIALER_BASE_URL = "https://dialer.ecommercewala.co";

const PARAMS: Record<string, string> = {
  person: "personId",
  company: "companyId",
  opportunity: "opportunityId",
};

export function dialerLinks(objectNameSingular: string | undefined, recordIds: string[]): string[] {
  const param = objectNameSingular ? PARAMS[objectNameSingular] : undefined;
  if (!param) return [];
  return recordIds.slice(0, 10).map((id) => `${DIALER_BASE_URL.replace(/\/$/, "")}/call?${param}=${encodeURIComponent(id)}`);
}
