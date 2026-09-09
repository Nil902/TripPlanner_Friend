"""
Places service for querying and caching candidate venues.
"""

import logging
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
    hours: tuple[str, str]


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
    """Query Google Places API (New) for candidate attractions and dining."""
    if not settings.GOOGLE_MAPS_API_KEY:
        return []

    try:
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
        with httpx.Client(timeout=4.0) as client:
            resp = client.post(url, json=body, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                items: list[CatalogItem] = []
                price_map = {
                    "PRICE_LEVEL_FREE": 0.0,
                    "PRICE_LEVEL_INEXPENSIVE": 15.0,
                    "PRICE_LEVEL_MODERATE": 25.0,
                    "PRICE_LEVEL_EXPENSIVE": 50.0,
                    "PRICE_LEVEL_VERY_EXPENSIVE": 90.0,
                }
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

                    loc = p.get("location", {})
                    lat = float(loc.get("latitude", 0.0))
                    lng = float(loc.get("longitude", 0.0))
                    price_lvl = p.get("priceLevel", "PRICE_LEVEL_MODERATE")
                    cost = price_map.get(price_lvl, 20.0)

                    items.append(
                        {
                            "name": name,
                            "category": cat,
                            "lat": lat,
                            "lng": lng,
                            "est_cost": cost,
                            "hours": ("0900", "2000"),
                        }
                    )
                if items:
                    logger.info(
                        f"Retrieved {len(items)} places from Google Places API for {destination}"
                    )
                    return items
    except Exception as exc:
        logger.warning(
            f"Google Places API query failed ({exc}). Falling back to cached catalog."
        )

    return []


def fetch_google_distance_matrix(
    origin: tuple[float, float],
    destination: tuple[float, float],
    mode: str = "transit",
) -> int | None:
    """Fetch transit travel time in minutes from Google Distance Matrix API."""
    if not settings.GOOGLE_MAPS_API_KEY:
        return None

    try:
        url = "https://maps.googleapis.com/maps/api/distancematrix/json"
        params = {
            "origins": f"{origin[0]},{origin[1]}",
            "destinations": f"{destination[0]},{destination[1]}",
            "mode": mode,
            "key": settings.GOOGLE_MAPS_API_KEY,
        }
        with httpx.Client(timeout=3.0) as client:
            resp = client.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                rows = data.get("rows", [])
                if rows:
                    elements = rows[0].get("elements", [])
                    if elements and elements[0].get("status") == "OK":
                        duration_sec = elements[0].get("duration", {}).get("value", 0)
                        return int(max(1, round(float(duration_sec) / 60)))
    except Exception as exc:
        logger.warning(f"Google Distance Matrix query failed ({exc}).")

    return None


def get_or_create_places_for_destination(
    session: Session, destination: str
) -> list[Place]:
    """Retrieve or generate cached candidate venues for a given destination."""
    dest_key = destination.lower().split(",")[0].strip()
    catalog: list[CatalogItem] = DESTINATION_CATALOG.get(dest_key, [])

    # If key destination not in static catalog, attempt live Places API lookup
    if not catalog:
        live_places = fetch_from_google_places_api(destination)
        if live_places:
            catalog = live_places

    if not catalog:
        # Fallback generator for unlisted cities with realistic mock attributes
        base_lat = 40.7128 if "new york" in dest_key else 37.7749
        base_lng = -74.0060 if "new york" in dest_key else -122.4194
        catalog = [
            {
                "name": f"{destination} Historic Old Town",
                "category": "landmark",
                "lat": base_lat,
                "lng": base_lng,
                "est_cost": 0.0,
                "hours": ("0800", "2000"),
            },
            {
                "name": f"{destination} Central Art Museum",
                "category": "museum",
                "lat": base_lat + 0.015,
                "lng": base_lng + 0.012,
                "est_cost": 14.0,
                "hours": ("1000", "1800"),
            },
            {
                "name": f"{destination} Grand Botanical Garden",
                "category": "park",
                "lat": base_lat - 0.012,
                "lng": base_lng - 0.015,
                "est_cost": 8.0,
                "hours": ("0900", "1700"),
            },
            {
                "name": f"{destination} Culinary Market Hall",
                "category": "restaurant",
                "lat": base_lat + 0.005,
                "lng": base_lng - 0.008,
                "est_cost": 24.0,
                "hours": ("1100", "2200"),
            },
            {
                "name": f"{destination} Panoramic Viewpoint",
                "category": "viewpoint",
                "lat": base_lat - 0.022,
                "lng": base_lng + 0.018,
                "est_cost": 0.0,
                "hours": ("0000", "2359"),
            },
            {
                "name": f"{destination} Riverside Bistro",
                "category": "restaurant",
                "lat": base_lat + 0.008,
                "lng": base_lng + 0.014,
                "est_cost": 32.0,
                "hours": ("1200", "2300"),
            },
        ]

    places: list[Place] = []
    for item in catalog:
        name_str = str(item["name"])
        cat_str = str(item["category"])
        lat_val = float(item["lat"])
        lng_val = float(item["lng"])
        cost_val = float(item["est_cost"])
        hours_tuple = item["hours"]
        open_time = str(hours_tuple[0])
        close_time = str(hours_tuple[1])

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
                opening_hours=build_opening_hours_periods(open_time, close_time),
                cached_at=utc_now(),
            )
            session.add(existing)
            session.commit()
            session.refresh(existing)
        places.append(existing)

    return places


def find_alternative_place(
    session: Session,
    current_place: Place,
    destination: str,
    max_cost: float,
    excluded_place_ids: list[str],
) -> Place | None:
    """Finds a replacement venue of matching or complementary category within budget."""
    candidates = get_or_create_places_for_destination(session, destination)

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
