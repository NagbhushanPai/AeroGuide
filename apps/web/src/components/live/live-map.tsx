"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { Feature, FeatureCollection } from "geojson";
import {
  Map as MapLibreMap,
  NavigationControl,
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type MapMouseEvent,
  setWorkerUrl,
} from "maplibre-gl";
import { useTheme } from "next-themes";
import { useEffect, useLayoutEffect, useRef } from "react";

import type { AircraftFeature, ReportedRoute } from "@/lib/api/client";

import { AIRCRAFT_ICON_ID, createAircraftIcon } from "./aircraft-icon";
import { ALTITUDE_STOPS, GROUND_COLOR } from "./altitude";
import { moveAircraft } from "./motion";

export type LayerVisibility = { traffic: boolean; weather: boolean; airports: boolean };
export type FlyTarget = { lon: number; lat: number; key: number };

type Theme = "dark" | "light";

type LiveMapProps = {
  features: AircraftFeature[];
  selected: string | null;
  onSelect: (icao24: string | null) => void;
  /** An airport dot was clicked (IATA code). */
  onAirportSelect: (iata: string) => void;
  layers: LayerVisibility;
  route: ReportedRoute | null;
  flyTo: FlyTarget | null;
  weatherTilesUrl: string | null;
  /** The data is too old to trust (no update for 5 min): aircraft are drawn faded. */
  dimmed: boolean;
};

const STYLES: Record<Theme, string> = {
  dark: "https://tiles.openfreemap.org/styles/dark",
  light: "https://tiles.openfreemap.org/styles/positron",
};
// Served from public/vendor (copied at dev/build time by scripts/copy-maplibre-worker.mjs).
setWorkerUrl("/vendor/maplibre-gl-worker.js");

const INDIA_CENTER: [number, number] = [80, 22.5];

const ALTITUDE_COLOR = [
  "case",
  ["get", "on_ground"],
  GROUND_COLOR,
  [
    "interpolate",
    ["linear"],
    ["coalesce", ["get", "alt_baro_ft"], 0],
    ...ALTITUDE_STOPS.flatMap((stop) => [stop.ft, stop.color]),
  ],
] as unknown as ExpressionSpecification;

const AIRCRAFT_OPACITY = [
  "case",
  ["get", "is_demo"],
  0.85,
  1,
] as unknown as ExpressionSpecification;
const DIMMED_OPACITY = 0.35;

// Overlay colours per basemap: the dark style needs light text, Positron (light) needs dark.
const PALETTE: Record<
  Theme,
  {
    dot: string;
    dotStroke: string;
    label: string;
    labelHalo: string;
    route: string;
    routeLabel: string;
    routeHalo: string;
    aircraftHalo: string;
  }
> = {
  dark: {
    dot: "#0b1220",
    dotStroke: "#94a3b8",
    label: "#94a3b8",
    labelHalo: "#0b1220",
    route: "#38bdf8",
    routeLabel: "#e2e8f0",
    routeHalo: "#0b1220",
    aircraftHalo: "rgba(5,10,20,0.85)",
  },
  light: {
    dot: "#ffffff",
    dotStroke: "#475569",
    label: "#334155",
    labelHalo: "#ffffff",
    route: "#0284c7",
    routeLabel: "#0f172a",
    routeHalo: "#ffffff",
    aircraftHalo: "rgba(15,23,42,0.75)",
  },
};

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** How often moving aircraft are redrawn (twice a second is smooth at country zoom). */
const MOTION_TICK_MS = 500;

function toCollection(features: AircraftFeature[]): FeatureCollection {
  return { type: "FeatureCollection", features: features as unknown as Feature[] };
}

function routeCollection(
  route: ReportedRoute | null,
  aircraft: AircraftFeature | undefined,
): FeatureCollection {
  if (!route || !aircraft) return EMPTY;
  const here = aircraft.geometry.coordinates as [number, number];
  const origin: [number, number] = [route.origin.lon, route.origin.lat];
  const dest: [number, number] = [route.destination.lon, route.destination.lat];
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { part: "flown" },
        geometry: { type: "LineString", coordinates: [origin, here] },
      },
      {
        type: "Feature",
        properties: { part: "ahead" },
        geometry: { type: "LineString", coordinates: [here, dest] },
      },
      {
        type: "Feature",
        properties: { code: route.origin.iata ?? route.origin.icao ?? "" },
        geometry: { type: "Point", coordinates: origin },
      },
      {
        type: "Feature",
        properties: { code: route.destination.iata ?? route.destination.icao ?? "" },
        geometry: { type: "Point", coordinates: dest },
      },
    ],
  };
}

/** Adds our sources and layers with the theme's colours. Safe to call again after a style change. */
function addOverlays(map: MapLibreMap, theme: Theme) {
  const c = PALETTE[theme];
  if (!map.hasImage(AIRCRAFT_ICON_ID)) {
    const icon = createAircraftIcon();
    if (icon) map.addImage(AIRCRAFT_ICON_ID, icon, { sdf: true, pixelRatio: 2 });
  }
  if (!map.getSource("airports")) {
    map.addSource("airports", { type: "geojson", data: "/data/airports-in.geojson" });
    map.addLayer({
      id: "airports-dot",
      type: "circle",
      source: "airports",
      paint: {
        "circle-radius": ["match", ["get", "size"], "large", 4, 3],
        "circle-color": c.dot,
        "circle-stroke-color": c.dotStroke,
        "circle-stroke-width": 1.5,
      },
    });
    map.addLayer({
      id: "airports-label",
      type: "symbol",
      source: "airports",
      minzoom: 4,
      filter: ["any", ["==", ["get", "size"], "large"], [">=", ["zoom"], 6]],
      layout: {
        "text-field": ["get", "iata"],
        "text-font": ["Noto Sans Regular"],
        "text-size": 11,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
      },
      paint: { "text-color": c.label, "text-halo-color": c.labelHalo, "text-halo-width": 1.2 },
    });
  }
  if (!map.getSource("route")) {
    map.addSource("route", { type: "geojson", data: EMPTY });
    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": c.route,
        "line-width": 2,
        "line-opacity": ["match", ["get", "part"], "flown", 0.9, 0.6],
        "line-dasharray": [
          "match",
          ["get", "part"],
          "ahead",
          ["literal", [2, 2]],
          ["literal", [1, 0]],
        ],
      },
    });
    map.addLayer({
      id: "route-ends",
      type: "symbol",
      source: "route",
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        "text-field": ["get", "code"],
        "text-font": ["Noto Sans Bold"],
        "text-size": 12,
        "text-offset": [0, -1.2],
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": c.routeLabel,
        "text-halo-color": c.routeHalo,
        "text-halo-width": 1.5,
      },
    });
  }
  if (!map.getSource("aircraft")) {
    map.addSource("aircraft", { type: "geojson", data: EMPTY, promoteId: "icao24" });
    map.addLayer({
      id: "aircraft-halo",
      type: "circle",
      source: "aircraft",
      paint: {
        "circle-radius": 16,
        "circle-color": c.route,
        "circle-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.25, 0],
        "circle-stroke-color": c.route,
        "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 1.5, 0],
      },
    });
    map.addLayer({
      id: "aircraft",
      type: "symbol",
      source: "aircraft",
      layout: {
        "icon-image": AIRCRAFT_ICON_ID,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 3, 0.45, 7, 0.7, 10, 0.9],
        "icon-rotate": ["coalesce", ["get", "track_deg"], 0],
        "icon-rotation-alignment": "map",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
      paint: {
        "icon-color": ALTITUDE_COLOR,
        "icon-halo-color": c.aircraftHalo,
        "icon-halo-width": 1,
        "icon-opacity": AIRCRAFT_OPACITY,
      },
    });
  }
}

/** Re-colours existing overlays for a theme (layers that don't exist yet are skipped). */
function applyTheme(map: MapLibreMap, theme: Theme) {
  const c = PALETTE[theme];
  const paint = (
    layer: string,
    prop: Parameters<MapLibreMap["setPaintProperty"]>[1],
    value: string,
  ) => {
    if (map.getLayer(layer)) map.setPaintProperty(layer, prop, value);
  };
  paint("airports-dot", "circle-color", c.dot);
  paint("airports-dot", "circle-stroke-color", c.dotStroke);
  paint("airports-label", "text-color", c.label);
  paint("airports-label", "text-halo-color", c.labelHalo);
  paint("route-line", "line-color", c.route);
  paint("route-ends", "text-color", c.routeLabel);
  paint("route-ends", "text-halo-color", c.routeHalo);
  paint("aircraft-halo", "circle-color", c.route);
  paint("aircraft-halo", "circle-stroke-color", c.route);
  paint("aircraft", "icon-halo-color", c.aircraftHalo);
}

function applyDimmed(map: MapLibreMap, dimmed: boolean) {
  if (map.getLayer("aircraft"))
    map.setPaintProperty("aircraft", "icon-opacity", dimmed ? DIMMED_OPACITY : AIRCRAFT_OPACITY);
}

function setWeather(map: MapLibreMap, url: string | null, visible: boolean) {
  const has = map.getSource("weather");
  if (!visible || !url) {
    if (map.getLayer("weather")) map.removeLayer("weather");
    if (has) map.removeSource("weather");
    return;
  }
  if (has) return;
  map.addSource("weather", {
    type: "raster",
    tiles: [url],
    tileSize: 256,
    maxzoom: 7, // RainViewer serves radar up to zoom 7; MapLibre overzooms beyond it
    attribution:
      '<a href="https://www.rainviewer.com/" target="_blank" rel="noopener">Weather data by RainViewer</a>',
  });
  map.addLayer(
    { id: "weather", type: "raster", source: "weather", paint: { "raster-opacity": 0.6 } },
    "airports-dot",
  );
}

export function LiveMap({
  features,
  selected,
  onSelect,
  onAirportSelect,
  layers,
  route,
  flyTo,
  weatherTilesUrl,
  dimmed,
}: LiveMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const { resolvedTheme } = useTheme();
  const theme: Theme = resolvedTheme === "light" ? "light" : "dark";
  /** The basemap theme the map was created with or last switched to. */
  const styleTheme = useRef<Theme | null>(null);

  // Latest props, read by handlers that outlive a render (style reloads, clicks).
  const latest = useRef({
    features,
    selected,
    onSelect,
    onAirportSelect,
    layers,
    route,
    weatherTilesUrl,
    dimmed,
    theme,
    animate: false,
  });
  useLayoutEffect(() => {
    latest.current = {
      features,
      selected,
      onSelect,
      onAirportSelect,
      layers,
      route,
      weatherTilesUrl,
      dimmed,
      theme,
      animate: !dimmed && !prefersReducedMotion(),
    };
  });
  const prevSelected = useRef<string | null>(null);

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const initialTheme = latest.current.theme;
    const map = new MapLibreMap({
      container: container.current,
      style: STYLES[initialTheme],
      center: INDIA_CENTER,
      zoom: 4.2,
      minZoom: 2.5,
      maxZoom: 13,
      attributionControl: { compact: true },
      renderWorldCopies: false,
    });
    mapRef.current = map;
    styleTheme.current = initialTheme;
    map.addControl(new NavigationControl({ showCompass: false }), "bottom-right");

    const sync = () => {
      const l = latest.current;
      addOverlays(map, l.theme);
      applyTheme(map, l.theme);
      applyDimmed(map, l.dimmed);
      (map.getSource("aircraft") as GeoJSONSource | undefined)?.setData(
        toCollection(l.animate ? moveAircraft(l.features, Date.now()) : l.features),
      );
      const sel = l.features.find((f) => f.id === l.selected);
      (map.getSource("route") as GeoJSONSource | undefined)?.setData(routeCollection(l.route, sel));
      applyVisibility(map, l.layers);
      setWeather(map, l.weatherTilesUrl, l.layers.weather);
      if (l.selected)
        map.setFeatureState({ source: "aircraft", id: l.selected }, { selected: true });
    };
    map.on("style.load", sync);

    // Some basemap layers name icons their sprite doesn't ship (for example "circle-11").
    // An empty placeholder keeps MapLibre from warning about them on every tile.
    map.on("styleimagemissing", (e: { id: string }) => {
      if (!map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
    });

    const onClick = (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.icao24 as string | undefined;
      if (id) latest.current.onSelect(id);
    };
    map.on("click", "aircraft", onClick);
    map.on("click", (e: MapMouseEvent) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ["aircraft"] });
      if (hit.length === 0) latest.current.onSelect(null);
    });
    // Airports sit under the aircraft; an aircraft wins when both are under the pointer.
    map.on("click", "airports-dot", (e: MapLayerMouseEvent) => {
      if (map.queryRenderedFeatures(e.point, { layers: ["aircraft"] }).length) return;
      const iata = e.features?.[0]?.properties?.iata as string | undefined;
      if (iata) latest.current.onAirportSelect(iata);
    });
    for (const layer of ["aircraft", "airports-dot"]) {
      map.on("mouseenter", layer, () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", layer, () => (map.getCanvas().style.cursor = ""));
    }

    return () => {
      map.remove();
      mapRef.current = null;
      styleTheme.current = null;
    };
  }, []);

  // Theme → basemap. Skipped when the map already shows this theme, so the first mount loads
  // one style only. A full reload (diff: false) always fires "style.load", which re-adds the
  // overlays in this theme's colours.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleTheme.current === theme) return;
    styleTheme.current = theme;
    map.setStyle(STYLES[theme], { diff: false });
  }, [theme]);

  // Old data → faded aircraft.
  useEffect(() => {
    const map = mapRef.current;
    if (map?.isStyleLoaded()) applyDimmed(map, dimmed);
  }, [dimmed]);

  // Aircraft data. Airborne aircraft glide along their reported heading and speed between
  // updates (estimates, see motion.ts), unless the data is too old or motion is reduced.
  const animate = !dimmed && !prefersReducedMotion();
  useEffect(() => {
    const draw = () => {
      const map = mapRef.current;
      const src = map?.getSource("aircraft") as GeoJSONSource | undefined;
      if (!map || !src) return;
      src.setData(toCollection(animate ? moveAircraft(features, Date.now()) : features));
      // Keep the selected aircraft highlighted across redraws.
      const sel = latest.current.selected;
      if (sel) map.setFeatureState({ source: "aircraft", id: sel }, { selected: true });
    };
    draw();
    if (!animate) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") draw();
    }, MOTION_TICK_MS);
    return () => window.clearInterval(timer);
  }, [features, animate]);

  // Selection highlight.
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getSource("aircraft")) return;
    if (prevSelected.current) {
      map.setFeatureState({ source: "aircraft", id: prevSelected.current }, { selected: false });
    }
    if (selected) map.setFeatureState({ source: "aircraft", id: selected }, { selected: true });
    prevSelected.current = selected;
  }, [selected, features]);

  // Route line for the selected aircraft.
  useEffect(() => {
    const src = mapRef.current?.getSource("route") as GeoJSONSource | undefined;
    src?.setData(
      routeCollection(
        route,
        features.find((f) => f.id === selected),
      ),
    );
  }, [route, selected, features]);

  // Layer toggles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;
    applyVisibility(map, layers);
    setWeather(map, weatherTilesUrl, layers.weather);
  }, [layers, weatherTilesUrl]);

  // Move to a flight or airport chosen from a list or search (no animation if the visitor
  // asked for reduced motion).
  useEffect(() => {
    if (!flyTo) return;
    const map = mapRef.current;
    if (!map) return;
    const target = {
      center: [flyTo.lon, flyTo.lat] as [number, number],
      zoom: Math.max(map.getZoom(), 6.5),
    };
    if (prefersReducedMotion()) map.jumpTo(target);
    else map.flyTo({ ...target, duration: 800 });
  }, [flyTo]);

  return (
    // MapLibre's CSS makes the map element position: relative, so the absolute positioning
    // lives on a wrapper and the map element just fills it.
    <div className="absolute inset-0">
      <div ref={container} className="h-full w-full" role="region" aria-label="Live flight map" />
    </div>
  );
}

function applyVisibility(map: MapLibreMap, layers: LayerVisibility) {
  const set = (id: string, on: boolean) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  };
  set("aircraft", layers.traffic);
  set("aircraft-halo", layers.traffic);
  set("airports-dot", layers.airports);
  set("airports-label", layers.airports);
}
