"""
Places service for querying and caching candidate venues.
"""

import logging
import math
import time
from typing import TypedDict

import httpx
from sqlmodel import Session

from app.core.config import settings
from app.models.schema import Place, utc_now

logger = logging.getLogger(__name__)


class CatalogItem(TypedDict):
    name: str
    category: str
    lat: float
    lng: float
    est_cost: float
    hours: tuple[str, str] | None


# Curated high-fidelity places database for common destinations
DESTINATION_CATALOG: dict[str, list[CatalogItem]] = {
    "lisbon": [
        {
            "name": "Jerónimos Monastery",
            "category": "landmark",
            "lat": 38.6979,
            "lng": -9.2067,
            "est_cost": 12.0,
            "hours": ("0930", "1800"),
        },
        {
            "name": "Pastéis de Belém",
            "category": "cafe",
            "lat": 38.6975,
            "lng": -9.2032,
            "est_cost": 6.0,
            "hours": ("0800", "2100"),
        },
        {
            "name": "Belém Tower",
            "category": "landmark",
            "lat": 38.6916,
            "lng": -9.2160,
            "est_cost": 10.0,
            "hours": ("1000", "1730"),
        },
        {
            "name": "Time Out Market Lisbon",
            "category": "restaurant",
            "lat": 38.7071,
            "lng": -9.1460,
            "est_cost": 22.0,
            "hours": ("1000", "2359"),
        },
        {
            "name": "Castelo de S. Jorge",
            "category": "historic",
            "lat": 38.7139,
            "lng": -9.1335,
            "est_cost": 15.0,
            "hours": ("0900", "1900"),
        },
        {
            "name": "Miradouro de Santa Luzia",
            "category": "viewpoint",
            "lat": 38.7118,
            "lng": -9.1306,
            "est_cost": 0.0,
            "hours": ("0000", "2359"),
        },
        {
            "name": "Calouste Gulbenkian Museum",
            "category": "museum",
            "lat": 38.7375,
            "lng": -9.1537,
            "est_cost": 10.0,
            "hours": ("1000", "1800"),
        },
        {
            "name": "Ramiro Seafood Cervejaria",
            "category": "restaurant",
            "lat": 38.7202,
            "lng": -9.1339,
            "est_cost": 38.0,
            "hours": ("1200", "2300"),
        },
        {
            "name": "MAAT Art & Architecture",
            "category": "museum",
            "lat": 38.6958,
            "lng": -9.1943,
            "est_cost": 11.0,
            "hours": ("1000", "1900"),
        },
        {
            "name": "Alfama Traditional Fado Walk",
            "category": "culture",
            "lat": 38.7125,
            "lng": -9.1290,
            "est_cost": 0.0,
            "hours": ("0900", "2200"),
        },
        {
            "name": "LX Factory Market & Entertainment",
            "category": "entertainment",
            "lat": 38.7037,
            "lng": -9.1789,
            "est_cost": 0.0,
            "hours": ("1000", "2300"),
        },
        {
            "name": "Fado Museum Lisbon",
            "category": "museum",
            "lat": 38.7100,
            "lng": -9.1305,
            "est_cost": 5.0,
            "hours": ("1000", "1800"),
        },
        {
            "name": "Ribeira das Naus Promenade",
            "category": "viewpoint",
            "lat": 38.7077,
            "lng": -9.1395,
            "est_cost": 0.0,
            "hours": ("0000", "2359"),
        },
        {
            "name": "ZDB Gallery & Bar",
            "category": "entertainment",
            "lat": 38.7188,
            "lng": -9.1402,
            "est_cost": 8.0,
            "hours": ("1400", "0200"),
        },
    ],
    "tokyo": [
        {
            "name": "Senso-ji Temple",
            "category": "landmark",
            "lat": 35.7148,
            "lng": 139.7967,
            "est_cost": 0.0,
            "hours": ("0600", "1700"),
        },
        {
            "name": "Nakamise Shopping Street",
            "category": "market",
            "lat": 35.7126,
            "lng": 139.7964,
            "est_cost": 15.0,
            "hours": ("0900", "1900"),
        },
        {
            "name": "Tokyo Skytree",
            "category": "viewpoint",
            "lat": 35.7101,
            "lng": 139.8107,
            "est_cost": 25.0,
            "hours": ("1000", "2100"),
        },
        {
            "name": "Shinjuku Gyoen National Garden",
            "category": "park",
            "lat": 35.6852,
            "lng": 139.7101,
            "est_cost": 5.0,
            "hours": ("0900", "1630"),
        },
        {
            "name": "Meiji Jingu Shrine",
            "category": "historic",
            "lat": 35.6764,
            "lng": 139.6993,
            "est_cost": 0.0,
            "hours": ("0600", "1800"),
        },
        {
            "name": "Tsukiji Outer Market Tasting",
            "category": "restaurant",
            "lat": 35.6655,
            "lng": 139.7708,
            "est_cost": 28.0,
            "hours": ("0800", "1500"),
        },
        {
            "name": "teamLab Planets",
            "category": "museum",
            "lat": 35.6518,
            "lng": 139.7897,
            "est_cost": 32.0,
            "hours": ("0900", "2200"),
        },
        {
            "name": "Shibuya Crossing & Hachiko",
            "category": "landmark",
            "lat": 35.6595,
            "lng": 139.7005,
            "est_cost": 0.0,
            "hours": ("0000", "2359"),
        },
        {
            "name": "Shinjuku Golden Gai (Nightlife Alley)",
            "category": "entertainment",
            "lat": 35.6938,
            "lng": 139.7025,
            "est_cost": 20.0,
            "hours": ("1800", "0400"),
        },
        {
            "name": "Akihabara Electric Town",
            "category": "entertainment",
            "lat": 35.7023,
            "lng": 139.7745,
            "est_cost": 10.0,
            "hours": ("1000", "2100"),
        },
        {
            "name": "Ueno Park & Zoo",
            "category": "park",
            "lat": 35.7143,
            "lng": 139.7742,
            "est_cost": 6.0,
            "hours": ("0900", "1700"),
        },
    ],
    "paris": [
        {
            "name": "Louvre Museum",
            "category": "museum",
            "lat": 48.8606,
            "lng": 2.3376,
            "est_cost": 22.0,
            "hours": ("0900", "1800"),
        },
        {
            "name": "Tuileries Garden",
            "category": "park",
            "lat": 48.8634,
            "lng": 2.3275,
            "est_cost": 0.0,
            "hours": ("0700", "2100"),
        },
        {
            "name": "Musée d'Orsay",
            "category": "museum",
            "lat": 48.8599,
            "lng": 2.3266,
            "est_cost": 16.0,
            "hours": ("0930", "1800"),
        },
        {
            "name": "Eiffel Tower Summit",
            "category": "landmark",
            "lat": 48.8584,
            "lng": 2.2945,
            "est_cost": 35.0,
            "hours": ("0930", "2245"),
        },
        {
            "name": "Sainte-Chapelle",
            "category": "historic",
            "lat": 48.8554,
            "lng": 2.3450,
            "est_cost": 13.0,
            "hours": ("0900", "1700"),
        },
        {
            "name": "Le Marais Bistro Lunch",
            "category": "restaurant",
            "lat": 48.8575,
            "lng": 2.3622,
            "est_cost": 30.0,
            "hours": ("1200", "2230"),
        },
        {
            "name": "Montmartre & Sacré-Cœur",
            "category": "viewpoint",
            "lat": 48.8867,
            "lng": 2.3431,
            "est_cost": 0.0,
            "hours": ("0600", "2230"),
        },
        {
            "name": "Centre Pompidou",
            "category": "entertainment",
            "lat": 48.8607,
            "lng": 2.3523,
            "est_cost": 15.0,
            "hours": ("1100", "2100"),
        },
        {
            "name": "Luxembourg Gardens",
            "category": "park",
            "lat": 48.8462,
            "lng": 2.3372,
            "est_cost": 0.0,
            "hours": ("0730", "2130"),
        },
        {
            "name": "Le Marais Wine Bar",
            "category": "entertainment",
            "lat": 48.8580,
            "lng": 2.3610,
            "est_cost": 25.0,
            "hours": ("1700", "0100"),
        },
    ],
    "siem reap": [
        {
            "name": "Angkor Wat",
            "category": "landmark",
            "lat": 13.4125,
            "lng": 103.8670,
            "est_cost": 37.0,
            "hours": ("0500", "1730"),
        },
        {
            "name": "Bayon Temple",
            "category": "historic",
            "lat": 13.4414,
            "lng": 103.8593,
            "est_cost": 37.0,
            "hours": ("0730", "1730"),
        },
        {
            "name": "Ta Prohm Temple",
            "category": "historic",
            "lat": 13.4349,
            "lng": 103.8890,
            "est_cost": 37.0,
            "hours": ("0730", "1730"),
        },
        {
            "name": "Angkor Thom & South Gate",
            "category": "landmark",
            "lat": 13.4414,
            "lng": 103.8568,
            "est_cost": 0.0,
            "hours": ("0500", "1800"),
        },
        {
            "name": "Preah Khan Temple",
            "category": "historic",
            "lat": 13.4536,
            "lng": 103.8714,
            "est_cost": 37.0,
            "hours": ("0730", "1730"),
        },
        {
            "name": "Banteay Srei Temple",
            "category": "historic",
            "lat": 13.5993,
            "lng": 103.9659,
            "est_cost": 37.0,
            "hours": ("0730", "1730"),
        },
        {
            "name": "Phare Circus",
            "category": "entertainment",
            "lat": 13.3521,
            "lng": 103.8558,
            "est_cost": 18.0,
            "hours": ("2000", "2200"),
        },
        {
            "name": "Pub Street Night Market",
            "category": "entertainment",
            "lat": 13.3622,
            "lng": 103.8589,
            "est_cost": 8.0,
            "hours": ("1800", "0100"),
        },
        {
            "name": "Khmer Kitchen Restaurant",
            "category": "restaurant",
            "lat": 13.3617,
            "lng": 103.8572,
            "est_cost": 12.0,
            "hours": ("0700", "2200"),
        },
        {
            "name": "Siem Reap Floating Village Tour",
            "category": "culture",
            "lat": 13.2887,
            "lng": 103.8713,
            "est_cost": 20.0,
            "hours": ("0800", "1700"),
        },
        {
            "name": "Angkor National Museum",
            "category": "museum",
            "lat": 13.3643,
            "lng": 103.8558,
            "est_cost": 12.0,
            "hours": ("0830", "1830"),
        },
        {
            "name": "Sunrise at Angkor Wat",
            "category": "viewpoint",
            "lat": 13.4127,
            "lng": 103.8664,
            "est_cost": 37.0,
            "hours": ("0430", "0730"),
        },
    ],
}


def build_opening_hours_periods(open_hhmm: str, close_hhmm: str):
    """Generate 7-day Google Places opening_hours format."""
    periods = []
    for day in range(7):
        periods.append(
            {
                "open": {"day": day, "time": open_hhmm},
                "close": {"day": day, "time": close_hhmm},
            }
        )
    return {"periods": periods, "open_now": True}


def fetch_from_google_places_api(destination: str) -> list[CatalogItem]:
    """Query Google Places API (New) for candidate attractions and dining.

    Includes retry with exponential backoff for 429/5xx errors.
    """
    if not settings.GOOGLE_MAPS_API_KEY:
        return []

    url = "https://places.googleapis.com/v1/places:searchText"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": settings.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": (
            "places.id,places.displayName,places.primaryType,"
            "places.location,places.regularOpeningHours,places.priceLevel"
        ),
    }
    body = {
        "textQuery": f"top attractions, museums, and restaurants in {destination}",
        "maxResultCount": 10,
    }

    max_retries = 3
    last_exc: Exception | None = None

    for attempt in range(max_retries):
        try:
            with httpx.Client(timeout=8.0) as client:
                resp = client.post(url, json=body, headers=headers)

                if resp.status_code == 429 or resp.status_code >= 500:
                    last_exc = RuntimeError(
                        f"Google Places API returned {resp.status_code}"
                    )
                    wait = 1.5 * (2**attempt)
                    logger.warning(
                        f"Google Places API {resp.status_code}, retrying in {wait:.1f}s "
                        f"(attempt {attempt + 1}/{max_retries})"
                    )
                    time.sleep(wait)
                    continue

                if resp.status_code != 200:
                    logger.warning("Google Places API returned %s", resp.status_code)
                    return []

                data = resp.json()
                items: list[CatalogItem] = []
                price_map = {
                    "PRICE_LEVEL_FREE": 0.0,
                    "PRICE_LEVEL_INEXPENSIVE": 12.0,
                    "PRICE_LEVEL_MODERATE": 22.0,
                    "PRICE_LEVEL_EXPENSIVE": 48.0,
                    "PRICE_LEVEL_VERY_EXPENSIVE": 85.0,
                }
                dest_lower = destination.lower()
                is_se_asia = any(
                    c in dest_lower
                    for c in (
                        "cambodia",
                        "siem reap",
                        "angkor",
                        "thailand",
                        "bangkok",
                        "vietnam",
                        "bali",
                        "indonesia",
                    )
                )

                for p in data.get("places", []):
                    name = p.get("displayName", {}).get("text", "")
                    if not name:
                        continue
                    ptype = str(p.get("primaryType", "attraction")).lower()
                    if any(
                        w in ptype
                        for w in ("restaurant", "cafe", "food", "bakery", "bar")
                    ):
                        cat = "restaurant"
                    elif any(w in ptype for w in ("museum", "art_gallery")):
                        cat = "museum"
                    elif any(w in ptype for w in ("park", "garden")):
                        cat = "park"
                    elif any(w in ptype for w in ("view", "scenic")):
                        cat = "viewpoint"
                    else:
                        cat = "landmark"

                    loc = p.get("location")
                    if not isinstance(loc, dict):
                        continue
                    try:
                        lat = float(loc["latitude"])
                        lng = float(loc["longitude"])
                    except (KeyError, TypeError, ValueError):
                        continue
                    if (
                        not math.isfinite(lat)
                        or not math.isfinite(lng)
                        or not -90 <= lat <= 90
                        or not -180 <= lng <= 180
                        or (lat == 0.0 and lng == 0.0)
                    ):
                        continue

                    # Determine realistic cost
                    raw_price_lvl = p.get("priceLevel")
                    name_lower = name.lower()

                    if raw_price_lvl and raw_price_lvl in price_map:
                        cost = price_map[raw_price_lvl]
                    else:
                        # Google Places API v1 does not provide priceLevel for most tourist sights.
                        # Estimate realistic cost based on category, name, and destination region.
                        if cat in ("park", "viewpoint"):
                            cost = 0.0
                        elif cat == "museum":
                            cost = 12.0
                        elif cat == "restaurant":
                            cost = 10.0 if is_se_asia else 22.0
                        elif cat == "entertainment":
                            cost = 15.0
                        else:  # landmark / historic
                            # Free outdoor public spaces
                            if any(
                                w in name_lower
                                for w in (
                                    "square",
                                    "plaza",
                                    "bridge",
                                    "street",
                                    "crossing",
                                    "gate",
                                    "promenade",
                                    "quarter",
                                    "fountain",
                                    "market",
                                    "memorial",
                                    "park",
                                    "garden",
                                )
                            ):
                                cost = 0.0
                            elif any(
                                w in name_lower
                                for w in (
                                    "angkor",
                                    "wat",
                                    "bayon",
                                    "ta prohm",
                                    "banteay srei",
                                    "preah khan",
                                )
                            ):
                                cost = 37.0  # Official Angkor 1-day pass admission
                            elif any(
                                w in name_lower
                                for w in (
                                    "tower",
                                    "summit",
                                    "observatory",
                                    "castle",
                                    "palace",
                                    "citadel",
                                )
                            ):
                                cost = 18.0
                            elif any(
                                w in name_lower
                                for w in (
                                    "temple",
                                    "shrine",
                                    "pagoda",
                                    "church",
                                    "cathedral",
                                    "basilica",
                                    "mosque",
                                )
                            ):
                                cost = 5.0
                            else:
                                cost = 8.0

                    items.append(
                        {
                            "name": name,
                            "category": cat,
                            "lat": lat,
                            "lng": lng,
                            "est_cost": cost,
                            # Search results do not guarantee complete opening
                            # periods. Unknown hours must stay unknown rather
                            # than become a fictional daily schedule.
                            "hours": None,
                        }
                    )
                if items:
                    logger.info(
                        f"Retrieved {len(items)} places from Google Places API for {destination}"
                    )
                    return items
                return []

        except httpx.TimeoutException as exc:
            last_exc = exc
            wait = 1.5 * (2**attempt)
            logger.warning(
                f"Google Places API timeout (attempt {attempt + 1}/{max_retries}), "
                f"retrying in {wait:.1f}s"
            )
            time.sleep(wait)
        except httpx.HTTPError as exc:
            last_exc = exc
            logger.warning("Google Places API HTTP error: %s", type(exc).__name__)
            return []

    logger.warning(f"Google Places API failed after {max_retries} attempts: {last_exc}")
    return []


def fetch_google_distance_matrix(
    origin: tuple[float, float],
    destination: tuple[float, float],
    mode: str = "transit",
) -> int | None:
    """Fetch transit travel time in minutes from Google Distance Matrix API.

    Includes retry with exponential backoff for 429/5xx errors.
    """
    if not settings.GOOGLE_MAPS_API_KEY:
        return None

    url = "https://maps.googleapis.com/maps/api/distancematrix/json"
    params = {
        "origins": f"{origin[0]},{origin[1]}",
        "destinations": f"{destination[0]},{destination[1]}",
        "mode": mode,
        "key": settings.GOOGLE_MAPS_API_KEY,
    }

    max_retries = 3

    for attempt in range(max_retries):
        try:
            with httpx.Client(timeout=5.0) as client:
                resp = client.get(url, params=params)

                if resp.status_code == 429 or resp.status_code >= 500:
                    wait = 1.5 * (2**attempt)
                    logger.warning(
                        f"Google Distance Matrix {resp.status_code}, retrying in {wait:.1f}s "
                        f"(attempt {attempt + 1}/{max_retries})"
                    )
                    time.sleep(wait)
                    continue

                if resp.status_code != 200:
                    logger.warning(
                        f"Google Distance Matrix returned {resp.status_code}"
                    )
                    return None

                data = resp.json()
                rows = data.get("rows", [])
                if rows:
                    elements = rows[0].get("elements", [])
                    if elements and elements[0].get("status") == "OK":
                        duration_sec = elements[0].get("duration", {}).get("value", 0)
                        return int(max(1, round(float(duration_sec) / 60)))
                return None

        except httpx.TimeoutException:
            wait = 1.5 * (2**attempt)
            logger.warning(
                f"Google Distance Matrix timeout (attempt {attempt + 1}/{max_retries}), "
                f"retrying in {wait:.1f}s"
            )
            time.sleep(wait)
        except httpx.HTTPError as exc:
            logger.warning("Google Distance Matrix HTTP error: %s", type(exc).__name__)
            return None

    logger.warning(f"Google Distance Matrix failed after {max_retries} attempts")
    return None


def get_or_create_places_for_destination(
    session: Session, destination: str, *, commit_cache: bool = True
) -> list[Place]:
    """Retrieve candidate venues, optionally deferring cache commit to the caller."""
    dest_key = destination.lower().split(",")[0].strip()
    catalog: list[CatalogItem] = DESTINATION_CATALOG.get(dest_key, [])

    # If key destination not in static catalog, attempt live Places API lookup
    if not catalog:
        live_places = fetch_from_google_places_api(destination)
        if live_places:
            catalog = live_places

    if not catalog:
        logger.warning("No verified venues available for destination %s", destination)
        return []

    places: list[Place] = []
    added_places = False
    for item in catalog:
        name_str = str(item["name"])
        cat_str = str(item["category"])
        lat_val = float(item["lat"])
        lng_val = float(item["lng"])
        cost_val = float(item["est_cost"])
        hours_tuple = item["hours"]

        place_id = f"place_{dest_key}_{name_str.lower().replace(' ', '_')[:24]}"
        existing = session.get(Place, place_id)
        if not existing:
            existing = Place(
                place_id=place_id,
                name=name_str,
                category=cat_str,
                lat=lat_val,
                lng=lng_val,
                est_cost=cost_val,
                opening_hours=(
                    build_opening_hours_periods(*hours_tuple)
                    if hours_tuple is not None
                    else None
                ),
                cached_at=utc_now(),
            )
            session.add(existing)
            added_places = True
        places.append(existing)

    if added_places:
        session.flush()
        if commit_cache:
            session.commit()

    return places


def find_alternative_place(
    session: Session,
    current_place: Place,
    destination: str,
    max_cost: float,
    excluded_place_ids: list[str],
    forbidden_terms: list[str] | None = None,
) -> Place | None:
    """Finds a replacement venue of matching or complementary category within budget."""
    candidates = get_or_create_places_for_destination(session, destination)
    excluded_terms = [
        term.strip().lower() for term in forbidden_terms or [] if term.strip()
    ]
    candidates = [
        p
        for p in candidates
        if not any(
            term in p.name.lower() or term in p.category.lower()
            for term in excluded_terms
        )
    ]

    # Priority 1: Same category, not excluded, within budget
    for p in candidates:
        if (
            p.place_id not in excluded_place_ids
            and p.category == current_place.category
            and p.est_cost <= max_cost
        ):
            return p

    # Priority 2: Any non-excluded place within budget
    for p in candidates:
        if p.place_id not in excluded_place_ids and p.est_cost <= max_cost:
            return p

    return None
