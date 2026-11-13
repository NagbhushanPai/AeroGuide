"use client";

import { CloudRain, MapPin, Plane, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import type { LayerVisibility } from "./live-map";

const LAYERS: { key: keyof LayerVisibility; label: string; icon: LucideIcon }[] = [
  { key: "traffic", label: "Traffic", icon: Plane },
  { key: "weather", label: "Weather", icon: CloudRain },
  { key: "airports", label: "Airports", icon: MapPin },
];

export function LayerToggles({
  value,
  onChange,
}: {
  value: LayerVisibility;
  onChange: (next: LayerVisibility) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Map layers"
      className="inline-flex rounded-full border bg-background/90 p-1 shadow-sm backdrop-blur"
    >
      {LAYERS.map(({ key, label, icon: Icon }) => (
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
        </button>
      ))}
    </div>
  );
}
