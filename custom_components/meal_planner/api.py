"""REST API views for the Meal Planner panel.

One view class per endpoint, all backed by the same MealStorage
instance. Every mutating view fires the SIGNAL_UPDATE dispatcher signal
so the sensors refresh instantly (no polling).
"""
from __future__ import annotations

from typing import Any

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import SIGNAL_UPDATE
from .storage import MealStorage


def _notify_update(hass: HomeAssistant) -> None:
    async_dispatcher_send(hass, SIGNAL_UPDATE)


class MealPlannerMealsView(HomeAssistantView):
    """GET/POST /api/meal_planner/meals — list and add meals."""

    url = "/api/meal_planner/meals"
    name = "api:meal_planner:meals"

    def __init__(self, storage: MealStorage) -> None:
        self._storage = storage

    async def get(self, request: web.Request) -> web.Response:
        meals = await self._storage.get_meals()
        return self.json(meals)

    async def post(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except ValueError:
            return self.json_message("Invalid JSON body", status_code=400)

        name = data.get("name")
        if not name or not isinstance(name, str):
            return self.json_message("'name' is required", status_code=400)

        in_freezer = bool(data.get("in_freezer", False))
        meal = await self._storage.add_meal(name, in_freezer)
        _notify_update(request.app["hass"])
        return self.json(meal, status_code=201)


class MealPlannerMealView(HomeAssistantView):
    """PUT/DELETE /api/meal_planner/meals/{meal_id} — update and delete."""

    url = "/api/meal_planner/meals/{meal_id}"
    name = "api:meal_planner:meal"

    def __init__(self, storage: MealStorage) -> None:
        self._storage = storage

    async def put(self, request: web.Request, meal_id: str) -> web.Response:
        try:
            data: dict[str, Any] = await request.json()
        except ValueError:
            return self.json_message("Invalid JSON body", status_code=400)

        meal = await self._storage.update_meal(
            meal_id,
            name=data.get("name"),
            in_freezer=data.get("in_freezer"),
        )
        if meal is None:
            return self.json_message("Meal not found", status_code=404)

        _notify_update(request.app["hass"])
        return self.json(meal)

    async def delete(self, request: web.Request, meal_id: str) -> web.Response:
        deleted = await self._storage.delete_meal(meal_id)
        if not deleted:
            return self.json_message("Meal not found", status_code=404)

        _notify_update(request.app["hass"])
        return self.json_message("Deleted", status_code=200)


class MealPlannerMealEatenView(HomeAssistantView):
    """POST /api/meal_planner/meals/{meal_id}/eaten — mark a meal eaten."""

    url = "/api/meal_planner/meals/{meal_id}/eaten"
    name = "api:meal_planner:meal:eaten"

    def __init__(self, storage: MealStorage) -> None:
        self._storage = storage

    async def post(self, request: web.Request, meal_id: str) -> web.Response:
        meal = await self._storage.mark_eaten(meal_id)
        if meal is None:
            return self.json_message("Meal not found", status_code=404)

        _notify_update(request.app["hass"])
        return self.json(meal)


class MealPlannerReorderView(HomeAssistantView):
    """POST /api/meal_planner/meals/reorder — reorder the active queue."""

    url = "/api/meal_planner/meals/reorder"
    name = "api:meal_planner:meals:reorder"

    def __init__(self, storage: MealStorage) -> None:
        self._storage = storage

    async def post(self, request: web.Request) -> web.Response:
        try:
            data = await request.json()
        except ValueError:
            return self.json_message("Invalid JSON body", status_code=400)

        ids = data.get("ids")
        if not isinstance(ids, list):
            return self.json_message("'ids' must be a list", status_code=400)

        await self._storage.reorder(ids)
        _notify_update(request.app["hass"])
        return self.json_message("Reordered", status_code=200)
