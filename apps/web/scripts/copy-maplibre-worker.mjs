// MapLibre 6 loads its web worker from a separate file next to its bundle, which Next.js
// doesn't emit. Copy the self-contained worker into public/ so the map can load it from
// a stable URL (see setWorkerUrl in src/components/live/live-map.tsx).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/package.json"));
const here = dirname(fileURLToPath(import.meta.url));
const destDir = join(here, "..", "public", "vendor");
mkdirSync(destDir, { recursive: true });
// .js (not .mjs) so every host serves it with a JavaScript MIME type for module workers.
copyFileSync(join(dist, "dist", "maplibre-gl-worker.mjs"), join(destDir, "maplibre-gl-worker.js"));
console.log("copied maplibre-gl worker to public/vendor/");
