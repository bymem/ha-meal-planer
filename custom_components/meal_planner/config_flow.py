"""Config flow for Meal Planner.

There is nothing to configure — no API keys, no options — so setup is
a single confirm step. Only one meal queue makes sense per HA instance,
so a second install attempt is blocked.
"""
from __future__ import annotations

from homeassistant import config_entries
from homeassistant.data_entry_flow import FlowResult

from .const import DOMAIN


class MealPlannerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle the (config-free) Meal Planner setup flow."""

    VERSION = 1

    async def async_step_user(self, user_input: dict | None = None) -> FlowResult:
        """Single confirm step — no fields to fill in."""
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            return self.async_create_entry(title="Meal Planner", data={})

        return self.async_show_form(step_id="user")
