"use client";

import { useQuery } from "@tanstack/react-query";

type RainViewerMaps = {
  host: string;
  radar?: { past?: { time: number; path: string }[] };
};

/**
 * Latest RainViewer radar frame as an XYZ tile URL. Fetched only while the weather layer is on.
 * Free for personal, educational and community use with attribution (shown on the map).
 */
export function useWeatherTiles(enabled: boolean) {
  return useQuery({
    queryKey: ["rainviewer"],
    enabled,
    refetchInterval: 10 * 60_000, // new radar frames every 10 minutes
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }) => {
      const res = await fetch("https://api.rainviewer.com/public/weather-maps.json", { signal });
      if (!res.ok) throw new Error(`RainViewer ${res.status}`);
      const data = (await res.json()) as RainViewerMaps;
      const latest = data.radar?.past?.at(-1);
      if (!latest) return null;
      return {
        url: `${data.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`,
        time: new Date(latest.time * 1000).toISOString(),
      };
    },
  });
}
