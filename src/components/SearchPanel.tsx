"use client";

import { useEffect, useState } from "react";

type PersonHit = { id: string; name: string; companyName: string | null; phone: string | null; state: string | null; dnc: boolean };
type CompanyHit = { id: string; name: string; phone: string | null; state: string | null; dnc: boolean };

export function SearchPanel() {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [companies, setCompanies] = useState<CompanyHit[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setPeople([]);
      setCompanies([]);
      return;
    }
    const handle = setTimeout(async () => {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Search failed");
        return;
      }
      setError(null);
      setPeople(body.people ?? []);
      setCompanies(body.companies ?? []);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="stack">
      <label>
        Search Twenty
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or phone" />
      </label>
      {error ? <div className="banner bad">{error}</div> : null}
      {people.map((person) => (
        <div className="result" key={person.id}>
          <div>
            <strong>{person.name}</strong>
            <div className="muted">
              {person.companyName ?? "No company"} · {person.phone ?? "No phone"} · {person.state ?? "No state"}
              {person.dnc ? " · Do not call" : ""}
            </div>
          </div>
          <a className="button" href={`/call?personId=${person.id}`}>
            Call
          </a>
        </div>
      ))}
      {companies.map((company) => (
        <div className="result" key={company.id}>
          <div>
            <strong>{company.name}</strong>
            <div className="muted">
              Company · {company.phone ?? "No direct phone"} · {company.state ?? "No state"}
              {company.dnc ? " · Do not call" : ""}
            </div>
          </div>
          <a className="button secondary" href={`/call?companyId=${company.id}`}>
            Open
          </a>
        </div>
      ))}
      <form className="stack" action="/call">
        <label>
          Or dial a number
          <input name="phone" placeholder="+1 415 555 0100" />
        </label>
        <button className="secondary" type="submit">
          Check this number
        </button>
      </form>
    </div>
  );
}
