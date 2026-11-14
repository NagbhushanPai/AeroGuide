"use client";

import { CloudRain, Layers, MapPin, Plane, TriangleAlert, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatIstTime } from "@/lib/freshness";
import { cn } from "@/lib/utils";

import type { LayerVisibility } from "./live-map";

const LAYERS: { key: keyof LayerVisibility; label: string; icon: LucideIcon }[] = [
  { key: "traffic", label: "Traffic", icon: Plane },
  { key: "weather", label: "Weather", icon: CloudRain },
  { key: "airports", label: "Airports", icon: MapPin },
];

/** State of the weather radar layer, shown on its toggle. */
export type WeatherStatus =
  { kind: "off" } | { kind: "loading" } | { kind: "ready"; time: string } | { kind: "error" };

type Props = {
  value: LayerVisibility;
  onChange: (next: LayerVisibility) => void;
  weather: WeatherStatus;
};

/** "Radar 14:10 IST", "Radar unavailable", or null when there's nothing to add. */
export function weatherNote(weather: WeatherStatus): string | null {
  if (weather.kind === "ready") return `Radar ${formatIstTime(weather.time)}`;
  if (weather.kind === "error") return "Radar unavailable";
  if (weather.kind === "loading") return "Loading radar…";
  return null;
}

/** Inline toggles (sm and up). */
export function LayerToggles({ value, onChange, weather }: Props) {
  return (
    <div
      role="group"
      aria-label="Map layers"
      className="inline-flex rounded-full border bg-background/90 p-1 shadow-sm backdrop-blur"
    >
      {LAYERS.map(({ key, label, icon }) => {
        const failed = key === "weather" && weather.kind === "error";
        const Icon = failed ? TriangleAlert : icon;
        const note = key === "weather" ? weatherNote(weather) : null;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={value[key]}
            onClick={() => onChange({ ...value, [key]: !value[key] })}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
              "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              value[key]
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon aria-hidden="true" className="size-3.5" />
            {label}
            {note ? (
              <span className={cn("font-mono font-normal tabular-nums", failed && "italic")}>
                · {note}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** One "Layers" menu button for narrow screens, where three toggles don't fit. */
export function LayersMenu({ value, onChange, weather }: Props) {
  const note = weatherNote(weather);
  const on = LAYERS.filter((l) => value[l.key]).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="bg-background/90 backdrop-blur"
          aria-label={`Map layers (${on} of ${LAYERS.length} on)`}
        >
          {weather.kind === "error" && value.weather ? (
            <TriangleAlert aria-hidden="true" className="text-warning" />
          ) : (
            <Layers aria-hidden="true" />
          )}
          <span aria-hidden="true">Layers</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Map layers</DropdownMenuLabel>
        {LAYERS.map(({ key, label, icon: Icon }) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={value[key]}
            onCheckedChange={(checked) => onChange({ ...value, [key]: checked === true })}
            // Keep the menu open so several layers can be switched in one go.
            onSelect={(e) => e.preventDefault()}
          >
            <Icon aria-hidden="true" />
            <span className="flex flex-col">
              {label}
              {key === "weather" && note ? (
                <span className="text-xs text-muted-foreground">{note}</span>
              ) : null}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
