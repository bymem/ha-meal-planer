"""Persistent storage for the meal queue.

The meal list is a queue, not a calendar: meals have no date, only an
`order`. The first un-eaten meal is "today", the second is "tomorrow".
Marking a meal eaten pushes it to the back of the queue instead of
removing it, so it still shows up in the "eaten" history until deleted.
"""
from __future__ import annotations

from typing import Any
from uuid import uuid4

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION


class MealStorage:
    """CRUD + reorder operations over the persisted meal queue."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        # In-memory cache of the meal list, kept in sync with disk on every
        # mutation so reads never need to hit the Store.
        self._meals: list[dict[str, Any]] = []

    async def async_load(self) -> None:
        """Load the meal list from disk. Call once during setup."""
        data = await self._store.async_load()
        self._meals = data.get("meals", []) if data else []

    async def _async_save(self) -> None:
        await self._store.async_save({"meals": self._meals})

    async def get_meals(self) -> list[dict[str, Any]]:
        """Return the full meal list, sorted by order ascending."""
        return sorted(self._meals, key=lambda meal: meal["order"])

    def _next_order(self) -> int:
        return max((meal["order"] for meal in self._meals), default=-1) + 1

    def _find(self, meal_id: str) -> dict[str, Any] | None:
        return next((meal for meal in self._meals if meal["id"] == meal_id), None)

    async def add_meal(self, name: str, in_freezer: bool) -> dict[str, Any]:
        """Append a new meal to the end of the queue."""
        meal = {
            "id": str(uuid4()),
            "name": name,
            "in_freezer": in_freezer,
            "eaten": False,
            "order": self._next_order(),
        }
        self._meals.append(meal)
        await self._async_save()
        return meal

    async def update_meal(
        self,
        meal_id: str,
        name: str | None = None,
        in_freezer: bool | None = None,
    ) -> dict[str, Any] | None:
        """Patch a meal's name and/or freezer flag. Returns None if not found."""
        meal = self._find(meal_id)
        if meal is None:
            return None
        if name is not None:
            meal["name"] = name
        if in_freezer is not None:
            meal["in_freezer"] = in_freezer
        await self._async_save()
        return meal

    async def mark_eaten(self, meal_id: str) -> dict[str, Any] | None:
        """Mark a meal eaten and move it to the back of the queue."""
        meal = self._find(meal_id)
        if meal is None:
            return None
        meal["eaten"] = True
        meal["order"] = self._next_order()
        await self._async_save()
        return meal

    async def reorder(self, ids: list[str]) -> None:
        """Rewrite order values for the given ids, sequentially from 0.

        Only ids present in the list are renumbered; any meals not
        included (e.g. already-eaten meals, which aren't draggable in
        the UI) keep their existing order untouched.
        """
        for index, meal_id in enumerate(ids):
            meal = self._find(meal_id)
            if meal is not None:
                meal["order"] = index
        await self._async_save()

    async def delete_meal(self, meal_id: str) -> bool:
        """Remove a meal by id. Returns False if it didn't exist."""
        meal = self._find(meal_id)
        if meal is None:
            return False
        self._meals.remove(meal)
        await self._async_save()
        return True
