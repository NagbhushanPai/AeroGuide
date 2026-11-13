"""Indian states and union territories, and the regions used by the airport directory.

Codes are the ISO 3166-2:IN style codes used by OurAirports (`iso_region`). Names follow
OurAirports, except where a shorter common name reads better in the UI (marked below).

Regions follow the Zonal Councils set up under the States Reorganisation Act, 1956 (Ministry of
Home Affairs), plus the North Eastern Council for the eight north-eastern states. Island union
territories are not members of a zonal council; they are grouped with the South by convention.
"""

from datetime import date, datetime, timedelta, timezone
from enum import StrEnum

IST_TIMEZONE = "Asia/Kolkata"
# India has one zone and no daylight saving, so a fixed offset is exact (and needs no tzdata).
IST = timezone(timedelta(hours=5, minutes=30), "IST")


def today_ist() -> date:
    return datetime.now(IST).date()


class Region(StrEnum):
    NORTH = "North"
    CENTRAL = "Central"
    EAST = "East"
    WEST = "West"
    SOUTH = "South"
    NORTH_EAST = "North-East"


# code -> (display name, region)
STATES: dict[str, tuple[str, Region]] = {
    "IN-AN": ("Andaman and Nicobar Islands", Region.SOUTH),  # island UT, by convention
    "IN-AP": ("Andhra Pradesh", Region.SOUTH),
    "IN-AR": ("Arunachal Pradesh", Region.NORTH_EAST),
    "IN-AS": ("Assam", Region.NORTH_EAST),
    "IN-BR": ("Bihar", Region.EAST),
    "IN-CH": ("Chandigarh", Region.NORTH),
    "IN-CT": ("Chhattisgarh", Region.CENTRAL),
    "IN-DH": ("Dadra and Nagar Haveli and Daman and Diu", Region.WEST),
    "IN-DL": ("Delhi", Region.NORTH),  # OurAirports: "Delhi (National Capital Territory)"
    "IN-GA": ("Goa", Region.WEST),
    "IN-GJ": ("Gujarat", Region.WEST),
    "IN-HP": ("Himachal Pradesh", Region.NORTH),
    "IN-HR": ("Haryana", Region.NORTH),
    "IN-JH": ("Jharkhand", Region.EAST),
    "IN-JK": ("Jammu and Kashmir", Region.NORTH),
    "IN-KA": ("Karnataka", Region.SOUTH),
    "IN-KL": ("Kerala", Region.SOUTH),
    "IN-LA": ("Ladakh", Region.NORTH),
    "IN-LD": ("Lakshadweep", Region.SOUTH),  # island UT, by convention
    "IN-ML": ("Meghalaya", Region.NORTH_EAST),
    "IN-MM": ("Maharashtra", Region.WEST),
    "IN-MN": ("Manipur", Region.NORTH_EAST),
    "IN-MP": ("Madhya Pradesh", Region.CENTRAL),
    "IN-MZ": ("Mizoram", Region.NORTH_EAST),
    "IN-NL": ("Nagaland", Region.NORTH_EAST),
    "IN-OR": ("Odisha", Region.EAST),
    "IN-PB": ("Punjab", Region.NORTH),
    "IN-PY": ("Puducherry", Region.SOUTH),  # OurAirports: "Pondicherry"
    "IN-RJ": ("Rajasthan", Region.NORTH),
    "IN-SK": ("Sikkim", Region.NORTH_EAST),
    "IN-TG": ("Telangana", Region.SOUTH),
    "IN-TN": ("Tamil Nadu", Region.SOUTH),
    "IN-TR": ("Tripura", Region.NORTH_EAST),
    "IN-UP": ("Uttar Pradesh", Region.CENTRAL),
    "IN-UT": ("Uttarakhand", Region.CENTRAL),
    "IN-WB": ("West Bengal", Region.EAST),
}
