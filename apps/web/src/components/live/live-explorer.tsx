"use client";

import { List, Plane, RadioTower, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useNow } from "@/hooks/use-now";
import type { MapAirport } from "@/lib/airports";
import type { AircraftFeature } from "@/lib/api/client";
import { cn } from "@/lib/utils";

import { AirportCard } from "./airport-card";
import { AirportSearch, useMapAirports } from "./airport-search";

import { AlertsMenu, EventToasts } from "./alerts-menu";
import { AltitudeLegend } from "./altitude-legend";
import { FlightList } from "./flight-list";
import { FlightPanel, LostFlightPanel } from "./flight-panel";
import { LayersMenu, LayerToggles, type WeatherStatus } from "./layer-toggles";
import type { FlyTarget, LayerVisibility } from "./live-map";
import { liveState } from "./live-state";
import { IstClock, LiveStatus } from "./live-status";
import { useAircraft, usePositions } from "./use-live-data";
import { useWatchlist } from "./use-watchlist";
import { useWeatherTiles } from "./use-weather-tiles";

// MapLibre needs the browser (WebGL), so the map is client-only.
const LiveMap = dynamic(() => import("./live-map").then((m) => m.LiveMap), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 bg-muted/40 motion-safe:animate-pulse" aria-hidden="true" />
  ),
});

const NO_FEATURES: AircraftFeature[] = [];

/**
 * Reports the ?airport= code (from an airport guide's "Show on the live map" link). Kept in its
 * own Suspense boundary so reading the URL doesn't hold back the rest of the map's prerender,
 * and it follows client-side navigations, which `window.location` read once at mount did not.
 */
function AirportFromUrl({ onCode }: { onCode: (code: string | null) => void }) {
  const code = useSearchParams().get("airport")?.trim().toUpperCase() || null;
  useEffect(() => onCode(code), [code, onCode]);
  return null;
}

export function LiveExplorer() {
  const positions = usePositions();
  const features = positions.data?.features ?? NO_FEATURES;
  const meta = positions.data?.meta;
  const now = useNow();
  const status = liveState({
    meta,
    now,
    error: positions.isError,
    waking: positions.waking,
  });

  const [selected, setSelected] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const [layers, setLayers] = useState<LayerVisibility>({
    traffic: true,
    weather: false,
    airports: true,
  });
  const [listOpen, setListOpen] = useState(false);
  // undefined: the visitor hasn't picked or closed an airport since the URL last named one, so
  // the ?airport= code decides.
  const [airportChoice, setAirport] = useState<MapAirport | null | undefined>(undefined);
  const [linkedCode, setLinkedCode] = useState<string | null>(null);
  const onLinkedCode = useCallback((code: string | null) => {
    setLinkedCode(code);
    setAirport(undefined);
  }, []);
  const mapAirports = useMapAirports();
  const linked = useMemo(
    () => (linkedCode ? (mapAirports.data?.find((a) => a.iata === linkedCode) ?? null) : null),
    [linkedCode, mapAirports.data],
  );
  const airport = airportChoice === undefined ? linked : airportChoice;
  const linkedFlyTo = useMemo<FlyTarget | null>(
    () => (linked ? { lon: linked.lon, lat: linked.lat, key: 0 } : null),
    [linked],
  );
  const mapFlyTo = flyTo ?? (airportChoice === undefined ? linkedFlyTo : null);

  const weather = useWeatherTiles(layers.weather);
  const weatherStatus: WeatherStatus = !layers.weather
    ? { kind: "off" }
    : weather.isError || weather.data === null
      ? { kind: "error" }
      : weather.data
        ? { kind: "ready", time: weather.data.time }
        : { kind: "loading" };

  const watch = useWatchlist(positions.data?.features, meta?.mode);

  const selectedFeature = useMemo(
    () => features.find((f) => f.id === selected),
    [features, selected],
  );
  // Only poll the details while the aircraft is in the feed; once it's gone the API answers 404.
  const detail = useAircraft(selectedFeature ? selectedFeature.id : null);
  const lostSelection = selected !== null && !selectedFeature && positions.data !== undefined;

  const focus = useCallback(
    (icao24: string) => {
      const f = features.find((x) => x.id === icao24);
      setSelected(icao24);
      if (f) {
        const [lon, lat] = f.geometry.coordinates;
        setFlyTo({ lon, lat, key: Date.now() });
      }
      setAirport(null);
      setListOpen(false);
    },
    [features],
  );

  const focusAirport = useCallback((a: MapAirport) => {
    setSelected(null);
    setAirport(a);
    setFlyTo({ lon: a.lon, lat: a.lat, key: Date.now() });
  }, []);

  const selectAirportCode = useCallback(
    (iata: string) => {
      const a = mapAirports.data?.find((x) => x.iata === iata);
      if (a) focusAirport(a);
    },
    [mapAirports.data, focusAirport],
  );

  const list = (
    <FlightList
      features={features}
      selected={selected}
      onSelect={(f) => focus(f.id)}
      isWatched={watch.isWatched}
      onToggleWatch={watch.toggle}
    />
  );

  const showOverlayMessage = !positions.data || meta?.mode === "unavailable";
  const showCount = meta !== undefined && meta.mode !== "unavailable";

  return (
    <main id="main" className="relative flex h-[calc(100dvh-3.5rem)] overflow-hidden">
      <h1 className="sr-only">Live flight map of India</h1>
      <Suspense fallback={null}>
        <AirportFromUrl onCode={onLinkedCode} />
      </Suspense>

      {/* Sidebar (desktop) */}
      <aside
        aria-label="Live air traffic"
        className="hidden w-80 shrink-0 flex-col border-r bg-background md:flex"
      >
        <div className="space-y-1 border-b p-3">
          <div className="flex items-baseline justify-between">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <RadioTower aria-hidden="true" className="size-4 text-primary" /> Live air traffic
            </h2>
            {showCount ? (
              <p className="font-mono text-sm tabular-nums">
                <span className="text-lg font-semibold text-primary">
                  {meta.count.toLocaleString("en-IN")}
                </span>{" "}
                <span className="text-xs text-muted-foreground">tracked</span>
              </p>
            ) : null}
          </div>
          <LiveStatus meta={meta} state={status} />
        </div>
        {list}
      </aside>

      {/* Map */}
      <div className="relative min-w-0 flex-1">
        <LiveMap
          features={features}
          selected={selected}
          onSelect={(id) => {
            setSelected(id);
            if (id) setAirport(null);
          }}
          onAirportSelect={selectAirportCode}
          layers={layers}
          route={detail.data?.reported_route ?? null}
          flyTo={mapFlyTo}
          weatherTilesUrl={weather.data?.url ?? null}
          dimmed={status.kind === "expired"}
        />

        {/*
         * Top bar over the map. Below sm (phones) it takes two rows: the controls, then the
         * airport search at full width; the three layer toggles collapse into one menu.
         */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start gap-2 p-3">
          <div className="pointer-events-auto flex items-center gap-2">
            <Sheet open={listOpen} onOpenChange={setListOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-background/90 backdrop-blur md:hidden"
                >
                  <List aria-hidden="true" /> Flights
                  {showCount ? (
                    <span className="font-mono tabular-nums">
                      ({meta.count.toLocaleString("en-IN")})
                    </span>
                  ) : null}
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="flex flex-col gap-0 p-0 data-[side=left]:w-[min(22rem,90vw)]"
              >
                {/* Right padding keeps the title and status clear of the sheet's close button. */}
                <SheetHeader className="border-b pr-12">
                  <SheetTitle>Live air traffic</SheetTitle>
                  <SheetDescription asChild>
                    <div>
                      <LiveStatus meta={meta} state={status} />
                    </div>
                  </SheetDescription>
                </SheetHeader>
                {list}
              </SheetContent>
            </Sheet>
            <div className="hidden sm:block">
              <LayerToggles value={layers} onChange={setLayers} weather={weatherStatus} />
            </div>
            <div className="sm:hidden">
              <LayersMenu value={layers} onChange={setLayers} weather={weatherStatus} />
            </div>
          </div>
          <AirportSearch
            onSelect={focusAirport}
            className="pointer-events-auto order-last w-full sm:order-none sm:w-60"
          />
          <div className="pointer-events-auto ml-auto flex shrink-0 items-center gap-2 rounded-full border bg-background/90 py-1 pr-1 pl-3 backdrop-blur">
            <IstClock />
            <AlertsMenu
              watched={watch.watched}
              permission={watch.permission}
              onRequestPermission={watch.requestPermission}
              onUnwatch={watch.toggle}
              onFocus={focus}
            />
          </div>
        </div>

        {/* No data: explain instead of showing an empty map that looks like "no flights" */}
        {showOverlayMessage ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center p-6">
            <div className="pointer-events-auto max-w-sm rounded-xl border bg-background/95 p-5 text-center shadow-lg">
              <Plane aria-hidden="true" className="mx-auto mb-2 size-6 text-primary" />
              <LiveStatus meta={meta} state={status} />
              {status.kind === "unavailable" ||
              status.kind === "unreachable" ||
              status.kind === "expired" ? (
                <div className="mt-3 flex flex-col items-center gap-2">
                  <p className="text-xs text-muted-foreground" aria-live="polite">
                    {positions.isFetching
                      ? "Checking now…"
                      : positions.dataUpdatedAt
                        ? `Checked at ${new Date(positions.dataUpdatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} IST. Checking again automatically.`
                        : "Checking again automatically."}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={positions.isFetching}
                    onClick={() => void positions.refetch()}
                  >
                    <RefreshCw
                      aria-hidden="true"
                      className={cn(
                        "size-3.5",
                        positions.isFetching && "animate-spin motion-reduce:animate-none",
                      )}
                    />
                    Check now
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Selected flight */}
        {selectedFeature ? (
          <div className="absolute inset-x-2 bottom-2 z-20 max-h-[60%] md:inset-x-auto md:top-16 md:right-3 md:bottom-10 md:max-h-none md:w-96">
            <FlightPanel
              feature={selectedFeature}
              detail={detail.data}
              loading={detail.isLoading}
              error={detail.isError}
              watched={watch.isWatched(selectedFeature.id)}
              onToggleWatch={() =>
                watch.toggle(
                  selectedFeature.id,
                  detail.data?.reported_route?.flight_number ??
                    selectedFeature.properties.callsign ??
                    selectedFeature.id.toUpperCase(),
                )
              }
              onClose={() => setSelected(null)}
            />
          </div>
        ) : lostSelection ? (
          <div className="absolute inset-x-2 bottom-2 z-20 md:inset-x-auto md:top-16 md:right-3 md:bottom-auto md:w-96">
            <LostFlightPanel
              name={
                watch.watched.find((w) => w.icao24 === selected)?.label ?? selected.toUpperCase()
              }
              onClose={() => setSelected(null)}
            />
          </div>
        ) : null}

        {/* Selected airport (only when no flight is open) */}
        {airport && selected === null ? (
          <div className="absolute inset-x-2 bottom-2 z-20 md:inset-x-auto md:top-16 md:right-3 md:bottom-auto md:w-80">
            <AirportCard airport={airport} onClose={() => setAirport(null)} />
          </div>
        ) : null}

        <EventToasts events={watch.events} onDismiss={watch.dismiss} />

        <AltitudeLegend className="absolute bottom-6 left-2 z-10" />

        {/* Data credit (the map's own attribution control covers basemap and weather) */}
        {meta?.attribution ? (
          <p className="pointer-events-none absolute bottom-1 left-2 z-10 max-w-[60%] truncate text-[10px] text-muted-foreground">
            {meta.attribution} · Airports: OurAirports (public domain)
          </p>
        ) : null}
      </div>
    </main>
  );
}
