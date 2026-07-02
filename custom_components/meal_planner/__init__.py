"""The Meal Planner integration.

Wires together storage, the REST API, the HA services, the sensors and
the sidebar panel. Services and REST endpoints both call the same
MealStorage methods and fire the same dispatcher signal, so there is a
single source of truth for every mutation path.

HTTP views and services are registered in async_setup (called exactly
once per HA process, regardless of how many times the config entry is
reloaded) because aiohttp routes cannot be unregistered — registering
them again on every config entry setup would raise on reload. The
panel and sensors, which *do* support clean teardown, are scoped to
the config entry instead.
"""
from __future__ import annotations

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.typing import ConfigType

from . import panel
from .api import (
    MealPlannerMealEatenView,
    MealPlannerMealsView,
    MealPlannerMealView,
    MealPlannerReorderView,
)
from .const import DOMAIN, SIGNAL_UPDATE
from .storage import MealStorage

PLATFORMS = ["sensor"]

SERVICE_ADD_MEAL = "add_meal"
SERVICE_MARK_EATEN = "mark_eaten"
SERVICE_DELETE_MEAL = "delete_meal"
SERVICE_REORDER_MEALS = "reorder_meals"

ADD_MEAL_SCHEMA = vol.Schema(
    {
        vol.Required("name"): cv.string,
        vol.Optional("in_freezer", default=False): cv.boolean,
    }
)
MEAL_ID_SCHEMA = vol.Schema({vol.Required("meal_id"): cv.string})
REORDER_MEALS_SCHEMA = vol.Schema({vol.Required("ids"): [cv.string]})


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Set up the meal_planner domain: storage, HTTP views, services.

    Runs once per HA process, before any config entry is set up.
    """
    storage = MealStorage(hass)
    await storage.async_load()
    hass.data[DOMAIN] = {"storage": storage}

    _register_http_views(hass, storage)
    _register_services(hass, storage)
    await panel.async_register_static_path(hass)

    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Meal Planner from a config entry: panel + sensors."""
    storage: MealStorage = hass.data[DOMAIN]["storage"]
    hass.data[DOMAIN][entry.entry_id] = {"storage": storage}

    await panel.async_register_panel(hass)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a Meal Planner config entry: panel + sensors.

    HTTP views and services stay registered for the life of the HA
    process — see the async_setup docstring for why.
    """
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        panel.async_remove_panel(hass)
        hass.data[DOMAIN].pop(entry.entry_id)

    return unloaded


def _register_http_views(hass: HomeAssistant, storage: MealStorage) -> None:
    hass.http.register_view(MealPlannerMealsView(storage))
    hass.http.register_view(MealPlannerMealView(storage))
    hass.http.register_view(MealPlannerMealEatenView(storage))
    hass.http.register_view(MealPlannerReorderView(storage))


def _register_services(hass: HomeAssistant, storage: MealStorage) -> None:
    async def _notify() -> None:
        async_dispatcher_send(hass, SIGNAL_UPDATE)

    async def handle_add_meal(call: ServiceCall) -> None:
        await storage.add_meal(call.data["name"], call.data["in_freezer"])
        await _notify()

    async def handle_mark_eaten(call: ServiceCall) -> None:
        await storage.mark_eaten(call.data["meal_id"])
        await _notify()

    async def handle_delete_meal(call: ServiceCall) -> None:
        await storage.delete_meal(call.data["meal_id"])
        await _notify()

    async def handle_reorder_meals(call: ServiceCall) -> None:
        await storage.reorder(call.data["ids"])
        await _notify()

    hass.services.async_register(
        DOMAIN, SERVICE_ADD_MEAL, handle_add_meal, schema=ADD_MEAL_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_MARK_EATEN, handle_mark_eaten, schema=MEAL_ID_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_DELETE_MEAL, handle_delete_meal, schema=MEAL_ID_SCHEMA
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_REORDER_MEALS,
        handle_reorder_meals,
        schema=REORDER_MEALS_SCHEMA,
    )
