"use client";

import { List, Plane, RadioTower } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { MapAirport } from "@/lib/airports";
import type { AircraftFeature } from "@/lib/api/client";

import { AirportCard } from "./airport-card";
import { AirportSearch, useMapAirports } from "./airport-search";

import { AlertsMenu, EventToasts } from "./alerts-menu";
import { FlightList } from "./flight-list";
import { FlightPanel } from "./flight-panel";
import { LayerToggles } from "./layer-toggles";
import type { FlyTarget, LayerVisibility } from "./live-map";
import { IstClock, LiveStatus } from "./live-status";
import { useAircraft, usePositions } from "./use-live-data";
import { useWatchlist } from "./use-watchlist";
import { useWeatherTiles } from "./use-weather-tiles";

// MapLibre needs the browser (WebGL), so the map is client-only.
const LiveMap = dynamic(() => import("./live-map").then((m) => m.LiveMap), {
  ssr: false,
  loading: () => <div className="absolute inset-0 animate-pulse bg-muted/40" aria-hidden="true" />,
});

const NO_FEATURES: AircraftFeature[] = [];

export function LiveExplorer() {
  const positions = usePositions();
  const features = positions.data?.features ?? NO_FEATURES;
  const meta = positions.data?.meta;

  const [selected, setSelected] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  const [layers, setLayers] = useState<LayerVisibility>({
    traffic: true,
    weather: false,
    airports: true,
  });
  const [listOpen, setListOpen] = useState(false);
  // undefined: the visitor hasn't picked or closed an airport yet, so a "/?airport=DEL" link
  // (from an airport guide) decides. It's read once; the server render has no URL and shows none.
  const [airportChoice, setAirport] = useState<MapAirport | null | undefined>(undefined);
  const [linkedCode] = useState(() =>
    typeof window === "undefined"
      ? null
      : (new URLSearchParams(window.location.search).get("airport")?.toUpperCase() ?? null),
  );
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
  const detail = useAircraft(selected);
  const watch = useWatchlist(positions.data?.features, meta?.mode);

  const selectedFeature = useMemo(
    () => features.find((f) => f.id === selected),
    [features, selected],
  );

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

  return (
    <main id="main" className="relative flex h-[calc(100dvh-3.5rem)] overflow-hidden">
      <h1 className="sr-only">Live flight map of India</h1>

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
            {meta && meta.mode !== "unavailable" ? (
              <p className="font-mono text-sm tabular-nums">
                <span className="text-lg font-semibold text-primary">
                  {meta.count.toLocaleString("en-IN")}
                </span>{" "}
                <span className="text-xs text-muted-foreground">tracked</span>
              </p>
            ) : null}
          </div>
          <LiveStatus
            meta={meta}
            loading={positions.isLoading}
            waking={positions.waking}
            error={positions.isError}
          />
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
        />

        {/* Top bar over the map */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-2 p-3">
          <div className="pointer-events-auto flex items-center gap-2">
            <Sheet open={listOpen} onOpenChange={setListOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-background/90 backdrop-blur md:hidden"
                >
                  <List aria-hidden="true" /> Flights
                  {meta && meta.mode !== "unavailable" ? (
                    <span className="font-mono tabular-nums">({meta.count})</span>
                  ) : null}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex w-[22rem] flex-col p-0">
                <SheetHeader className="border-b">
                  <SheetTitle>Live air traffic</SheetTitle>
                  <SheetDescription asChild>
                    <div>
                      <LiveStatus
                        meta={meta}
                        loading={positions.isLoading}
                        waking={positions.waking}
                        error={positions.isError}
                      />
                    </div>
                  </SheetDescription>
                </SheetHeader>
                {list}
              </SheetContent>
            </Sheet>
            <LayerToggles value={layers} onChange={setLayers} />
            <AirportSearch onSelect={focusAirport} className="w-40 sm:w-60" />
          </div>
          <div className="pointer-events-auto flex items-center gap-2 rounded-full border bg-background/90 py-1 pr-1 pl-3 backdrop-blur">
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
              <LiveStatus
                meta={meta}
                loading={positions.isLoading}
                waking={positions.waking}
                error={positions.isError}
              />
              {meta?.mode === "unavailable" && meta.message ? (
                <p className="mt-2 text-sm text-muted-foreground">{meta.message}</p>
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
        ) : null}

        {/* Selected airport (only when no flight is open) */}
        {airport && !selectedFeature ? (
          <div className="absolute inset-x-2 bottom-2 z-20 md:inset-x-auto md:top-16 md:right-3 md:bottom-auto md:w-80">
            <AirportCard airport={airport} onClose={() => setAirport(null)} />
          </div>
        ) : null}

        <EventToasts events={watch.events} onDismiss={watch.dismiss} />

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
