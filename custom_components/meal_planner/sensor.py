"""Sensor platform for Meal Planner.

Two sensors reflect the front of the meal queue: today's meal (first
un-eaten entry) and tomorrow's meal (second un-eaten entry). Both push
updates immediately whenever storage changes, via a dispatcher signal —
there is no polling.
"""
from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.components.sensor import SensorEntity

from .const import DOMAIN, SIGNAL_UPDATE
from .storage import MealStorage


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the today/tomorrow meal sensors."""
    storage: MealStorage = hass.data[DOMAIN][entry.entry_id]["storage"]
    async_add_entities(
        [
            MealPlannerTodaySensor(storage, entry),
            MealPlannerTomorrowSensor(storage, entry),
        ]
    )


class MealPlannerSensorBase(SensorEntity):
    """Shared behaviour for the today/tomorrow sensors."""

    _attr_should_poll = False
    # Index into the un-eaten queue: 0 = today, 1 = tomorrow.
    _queue_index: int

    def __init__(self, storage: MealStorage, entry: ConfigEntry) -> None:
        self._storage = storage
        self._attr_unique_id = f"{entry.entry_id}_{self._queue_index}"

    async def async_added_to_hass(self) -> None:
        """Subscribe to storage updates and populate initial state."""
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_UPDATE, self._async_refresh)
        )
        await self._async_refresh()

    async def _async_refresh(self) -> None:
        meals = await self._storage.get_meals()
        upcoming = [meal for meal in meals if not meal["eaten"]]

        meal = upcoming[self._queue_index] if len(upcoming) > self._queue_index else None

        if meal is None:
            self._attr_native_value = "None"
            self._attr_extra_state_attributes = {
                "in_freezer": None,
                "eaten": None,
                "meal_id": None,
            }
        else:
            self._attr_native_value = meal["name"]
            self._attr_extra_state_attributes = {
                "in_freezer": meal["in_freezer"],
                "eaten": meal["eaten"],
                "meal_id": meal["id"],
            }

        if self._queue_index == 0:
            # The full un-eaten queue, exposed only on the today sensor so
            # the read-only dashboard card can render it reactively via
            # hass.states, without a separate REST poll.
            self._attr_extra_state_attributes["queue"] = [
                {"id": m["id"], "name": m["name"], "in_freezer": m["in_freezer"]}
                for m in upcoming
            ]

        # Only write state once the entity is actually registered; during
        # the initial call from async_added_to_hass this is always true,
        # but the guard keeps this method safe to call from anywhere.
        if self.hass is not None:
            self.async_write_ha_state()


class MealPlannerTodaySensor(MealPlannerSensorBase):
    """The first un-eaten meal in the queue."""

    _queue_index = 0
    _attr_name = "Today's Meal"
    _attr_icon = "mdi:silverware-fork-knife"

    def __init__(self, storage: MealStorage, entry: ConfigEntry) -> None:
        super().__init__(storage, entry)
        self.entity_id = "sensor.meal_planner_today"


class MealPlannerTomorrowSensor(MealPlannerSensorBase):
    """The second un-eaten meal in the queue."""

    _queue_index = 1
    _attr_name = "Tomorrow's Meal"
    _attr_icon = "mdi:silverware-fork-knife"

    def __init__(self, storage: MealStorage, entry: ConfigEntry) -> None:
        super().__init__(storage, entry)
        self.entity_id = "sensor.meal_planner_tomorrow"
