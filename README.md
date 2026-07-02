# Meal Planner

A Home Assistant custom integration for planning meals as a simple **queue** — no date scheduling. The first un-eaten meal is "today's meal", the second is "tomorrow's". Reorder the queue by dragging, and mark meals eaten to advance it.

## Features

- Sidebar panel to manage your meal queue: add, edit, reorder (drag & drop), mark eaten, delete
- Read-only `meal-planner-card` for any dashboard, showing today/tomorrow and (optionally) the full queue
- Freezer flag per meal, so you know what to defrost ahead of time
- `sensor.meal_planner_today` and `sensor.meal_planner_tomorrow` for use in automations/dashboards
- REST API and HA services for scripting your own automations
- No polling — sensors and the dashboard card update instantly on any change

## Installation (via HACS)

1. Have [HACS](https://hacs.xyz) installed in Home Assistant
2. Go to HACS → Integrations → ⋮ menu → Custom repositories
3. Add this repo URL, category: **Integration**
4. Install "Meal Planner" via HACS → restart HA
5. Go to **Settings → Devices & Services → Add Integration**, search for "Meal Planner" and confirm setup (no configuration needed)
6. Meal Planner appears in the sidebar

## Dashboard Card

`meal-planner-card` is auto-loaded on every dashboard — no manual resource step needed. Add it via the dashboard UI editor ("Add card" → search "Meal Planner"), or by YAML:

```yaml
type: custom:meal-planner-card
title: Meal Planner
show_full_list: true
show_freezer_flag: true
```

All three options also show up in the card's own GUI editor. It's read-only — use the sidebar panel or services to make changes.

## Services

| Service | Fields | Action |
|---|---|---|
| `meal_planner.add_meal` | `name` (str), `in_freezer` (bool) | Adds meal to end of queue |
| `meal_planner.mark_eaten` | `meal_id` (str) | Marks eaten, moves to end |
| `meal_planner.delete_meal` | `meal_id` (str) | Removes meal |
| `meal_planner.reorder_meals` | `ids` (list of str) | Full reorder of the active queue |

## Example Automation

```yaml
automation:
  - alias: "Meal Planner - Freezer reminder"
    trigger:
      - platform: time
        at: "20:00:00"
    condition:
      - condition: template
        value_template: "{{ state_attr('sensor.meal_planner_tomorrow', 'in_freezer') == true }}"
    action:
      - service: notify.mobile_app_YOUR_PHONE
        data:
          title: "🧊 Remember to defrost!"
          message: "Tomorrow's meal is {{ states('sensor.meal_planner_tomorrow') }} — take it out of the freezer."
```

Replace `notify.mobile_app_YOUR_PHONE` with your own mobile app notify service (Settings → Devices & Services → Mobile App → your device).
