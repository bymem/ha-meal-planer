"""Constants for the Meal Planner integration."""

DOMAIN = "meal_planner"

# Storage
STORAGE_KEY = "meal_planner.meals"
STORAGE_VERSION = 1

# Dispatcher signal sent whenever the meal list changes, so sensors
# (and anything else listening) can refresh immediately without polling.
SIGNAL_UPDATE = "meal_planner_update"

# Frontend panel
PANEL_URL_PATH = "meal-planner"
PANEL_MODULE_URL = "/hacsfiles/meal_planner/meal-planner-panel.js"
