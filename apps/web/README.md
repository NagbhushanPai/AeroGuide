# AeroGuide web

Next.js 16 (App Router, Cache Components), Tailwind CSS v4, shadcn/ui, TanStack Query, MapLibre GL JS.

Run it from the repository root with `pnpm dev:web` (the `dev` and `build` scripts first copy the MapLibre worker into `public/vendor/`). Regenerate the API types from a running API with `pnpm gen:api`. Setup, commands and environment variables are in [docs/deployment/local-development.md](../../docs/deployment/local-development.md). The architecture is in [docs/architecture/frontend-architecture.md](../../docs/architecture/frontend-architecture.md).
