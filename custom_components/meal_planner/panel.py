"""Registers the Meal Planner sidebar panel.

The panel is a plain web component, served by HACS from
/hacsfiles/meal_planner/meal-planner-panel.js (per HACS's frontend
convention of placing files under www/community/<repo>/).
"""
from __future__ import annotations

from homeassistant.components import panel_custom
from homeassistant.components.frontend import async_remove_panel as _async_remove_panel
from homeassistant.core import HomeAssistant

from .const import PANEL_MODULE_URL, PANEL_URL_PATH


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
