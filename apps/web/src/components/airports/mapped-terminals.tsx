import { ExternalLink, Map as MapIcon } from "lucide-react";

import type { MappedTerminals as MappedTerminalsData } from "@/lib/api/client";

import { ProvenanceLine } from "./provenance-line";

/** Terminal buildings as mapped in OpenStreetMap. Kept visibly apart from verified terminals. */
export function MappedTerminals({ data }: { data: MappedTerminalsData }) {
  return (
    <div className="rounded-xl border border-dashed bg-card p-5">
      <h3 className="flex items-center gap-2 font-semibold">
        <MapIcon aria-hidden="true" className="size-4 text-primary" /> As mapped in OpenStreetMap
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Terminal buildings that volunteers have mapped at this airport. Names are shown as mapped.
        They don&apos;t say which airlines or flights use each terminal, and they may be out of
        date.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {data.items.map((t) => (
          <li key={t.osm_url}>
            <a
              href={t.osm_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted"
            >
              <span>
                {t.name}
                {t.ref && !t.name.includes(t.ref) ? (
                  <span className="ml-1 font-mono text-xs text-muted-foreground">{t.ref}</span>
                ) : null}
              </span>
              <ExternalLink
                aria-hidden="true"
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="sr-only"> (OpenStreetMap, opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
      <ProvenanceLine provenance={data.provenance} className="mt-4" />
      <p className="mt-1 text-xs text-muted-foreground">{data.attribution}</p>
    </div>
  );
}
