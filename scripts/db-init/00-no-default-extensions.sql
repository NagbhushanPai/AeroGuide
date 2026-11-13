-- Mounted over the postgis image's /docker-entrypoint-initdb.d so its default init script
-- (which enables postgis, postgis_topology, postgis_tiger_geocoder and fuzzystrmatch) does not run.
-- Extensions are owned by Alembic migrations, matching managed Postgres (Supabase).
SELECT 1;
