export const DEFAULT_WINDOW_START_MINUTES = 8 * 60;
export const DEFAULT_WINDOW_END_MINUTES = 21 * 60;

export function parseClock(value: string | undefined, fallback: string): number {
  const raw = (value ?? fallback).trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (!match) {
    throw new Error(`Clock time must be HH:MM, received "${raw}"`);
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error(`Clock time is out of range: "${raw}"`);
  return hour * 60 + minute;
}

export function formatClock(minutes: number): string {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hour24 = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function zonedMinutes(date: Date, timeZone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
  } catch {
    throw new Error(`Unknown time zone "${timeZone}"`);
  }
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error(`Could not read the local time in ${timeZone}`);
  }
  const h = hour === 24 ? 0 : hour;
  return h * 60 + minute;
}

export function formatZonedTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

export type ZoneWindow = {
  timeZone: string;
  label: string;
  open: boolean;
  minutes: number;
};

export function evaluateCallingWindow(
  now: Date,
  timeZones: string[],
  startMinutes = DEFAULT_WINDOW_START_MINUTES,
  endMinutes = DEFAULT_WINDOW_END_MINUTES,
): { open: boolean; zones: ZoneWindow[] } {
  const zones = timeZones.map((timeZone) => {
    const minutes = zonedMinutes(now, timeZone);
    return {
      timeZone,
      label: formatZonedTime(now, timeZone),
      minutes,
      open: minutes >= startMinutes && minutes < endMinutes,
    };
  });
  return { open: zones.length > 0 && zones.every((zone) => zone.open), zones };
}
