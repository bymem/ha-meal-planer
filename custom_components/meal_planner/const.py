"""Constants for the Meal Planner integration."""

DOMAIN = "meal_planner"

# Storage
STORAGE_KEY = "meal_planner.meals"
STORAGE_VERSION = 1

# Dispatcher signal sent whenever the meal list changes, so sensors
# (and anything else listening) can refresh immediately without polling.
SIGNAL_UPDATE = "meal_planner_update"

# Frontend panel
#
# HACS's "integration" category only copies custom_components/ into the
# HA config dir — it does not manage a top-level www/community/ folder
# (that convention is for "plugin"/Lovelace-card category repos). So the
# panel JS ships inside the integration package itself, and we serve it
# via our own static path rather than relying on HACS's /hacsfiles/.
PANEL_URL_PATH = "meal-planner"
PANEL_STATIC_URL_PATH = "/meal_planner_files"
PANEL_MODULE_URL = f"{PANEL_STATIC_URL_PATH}/meal-planner-panel.js"

# Dashboard card — same www/ folder, same static path, but auto-loaded
# on every frontend page (add_extra_js_url) instead of being registered
# as a sidebar panel, so it's available to any Lovelace dashboard
# without the user having to add a resource manually.
CARD_MODULE_URL = f"{PANEL_STATIC_URL_PATH}/meal-planner-card.js"
