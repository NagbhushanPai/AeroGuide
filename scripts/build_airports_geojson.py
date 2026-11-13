"""Build the map's airports layer from OurAirports (public domain).

Usage:
    curl -L -o airports.csv https://davidmegginson.github.io/ourairports-data/airports.csv
    python scripts/build_airports_geojson.py airports.csv apps/web/public/data/airports-in.geojson

Keeps Indian airports with scheduled passenger service and an IATA code. Only static
geodata (codes, name, city, coordinates) is taken. Airport facts for the guides come from
official sources in Stage 3, not from here.
"""

import csv
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

KEEP_TYPES = {"large_airport", "medium_airport", "small_airport"}


def main(src: str, dest: str) -> None:
    features = []
    with open(src, encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            if row["iso_country"] != "IN" or row["type"] not in KEEP_TYPES:
                continue
            if row["scheduled_service"] != "yes" or not row["iata_code"].strip():
                continue
            features.append(
                {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [
                            round(float(row["longitude_deg"]), 5),
                            round(float(row["latitude_deg"]), 5),
                        ],
                    },
                    "properties": {
                        "iata": row["iata_code"].strip(),
                        "icao": (row["icao_code"] or row["gps_code"]).strip() or None,
                        "name": row["name"].strip(),
                        "city": row["municipality"].strip() or None,
                        "size": row["type"].removesuffix("_airport"),
                    },
                }
            )
    features.sort(key=lambda feat: feat["properties"]["iata"])
    out = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "OurAirports",
            "source_url": "https://ourairports.com/data/",
            "license": "Public domain",
            "generated_at": datetime.now(UTC).date().isoformat(),
            "filter": "iso_country=IN, scheduled_service=yes, has IATA code",
        },
        "features": features,
    }
    Path(dest).parent.mkdir(parents=True, exist_ok=True)
    Path(dest).write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), "utf-8")
    print(f"wrote {len(features)} airports to {dest}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
