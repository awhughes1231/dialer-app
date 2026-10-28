"use client";

import { useEffect, useState } from "react";
import { evaluateCallingWindow, formatClock } from "@/lib/compliance/hours";

export function LocalClock({
  timeZones,
  startMinutes,
  endMinutes,
}: {
  timeZones: string[];
  startMinutes: number;
  endMinutes: number;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (timeZones.length === 0) return <p className="muted">Prospect time zone is not known yet.</p>;
  const window = evaluateCallingWindow(now, timeZones, startMinutes, endMinutes);
  return (
    <div className={window.open ? "banner ok" : "banner bad"}>
      <strong>{window.zones.map((zone) => zone.label).join(" · ")}</strong>
      <div>
        {window.open ? "Inside" : "Outside"} the calling window ({formatClock(startMinutes)}–{formatClock(endMinutes)} local).
      </div>
    </div>
  );
}
