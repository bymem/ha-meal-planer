"""Registers the Meal Planner sidebar panel.

The panel is a plain web component. Its JS ships inside this
integration's own package (custom_components/meal_planner/www/) and is
served via a static path registered by this integration — not HACS's
/hacsfiles/, which only serves files for "plugin" category repos, not
"integration" ones (see const.py for the full explanation).
"""
from __future__ import annotations

from pathlib import Path

from homeassistant.components import panel_custom
from homeassistant.components.frontend import async_remove_panel as _async_remove_panel
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import PANEL_MODULE_URL, PANEL_STATIC_URL_PATH, PANEL_URL_PATH

_WWW_DIR = Path(__file__).parent / "www"


async def async_register_static_path(hass: HomeAssistant) -> None:
    """Serve custom_components/meal_planner/www/ at PANEL_STATIC_URL_PATH.

    Call once per HA process (from async_setup) — like the HTTP API
    views, static path routes cannot be unregistered, so registering
    this again on every config entry setup would raise on reload.
    """
    await hass.http.async_register_static_paths(
        [StaticPathConfig(PANEL_STATIC_URL_PATH, str(_WWW_DIR), True)]
    )


async def async_register_panel(hass: HomeAssistant) -> None:
    """Register the /meal-planner sidebar panel."""
    await panel_custom.async_register_panel(
        hass,
        webcomponent_name="meal-planner-panel",
        frontend_url_path=PANEL_URL_PATH,
        module_url=PANEL_MODULE_URL,
        sidebar_title="Meal Planner",
        sidebar_icon="mdi:silverware-fork-knife",
        require_admin=False,
    )


def async_remove_panel(hass: HomeAssistant) -> None:
    """Remove the /meal-planner sidebar panel on unload."""
    _async_remove_panel(hass, PANEL_URL_PATH)
