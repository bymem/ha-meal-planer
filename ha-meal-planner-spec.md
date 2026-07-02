# Home Assistant Custom Integration: Meal Planner

**Target**: HACS-installable custom integration for Home Assistant  
**Storage**: JSON file via HA's built-in storage helper (`Store`)  
**UI**: HA frontend panel (vanilla JS, no framework)  
**Language**: Python 3.11+ / vanilla JS

---

## Integration Structure

```
custom_components/meal_planner/
├── __init__.py          # Integration setup, service registration
├── manifest.json        # HACS/HA metadata
├── sensor.py            # Sensor entities
├── storage.py           # MealStorage class (CRUD + reorder)
├── services.yaml        # Service definitions
└── panel.py             # Registers /meal-planner panel

www/community/meal_planner/    # HACS frontend convention
└── meal-planner-panel.js      # Panel UI (web component)

hacs.json                      # HACS repository metadata
README.md                      # HACS listing description
```

---

## Data Model

Each meal entry:

```json
{
  "id": "uuid4",
  "name": "Pasta Bolognese",
  "in_freezer": false,
  "eaten": false,
  "order": 0
}
```

The meal list is a **queue** — no date scheduling. The first un-eaten item is "today's meal", the second is "tomorrow's". Users reorder manually and mark meals as eaten to advance the queue.

---

## Storage (`storage.py`)

Class: `MealStorage`

- Uses `homeassistant.helpers.storage.Store` with key `meal_planner.meals`, version 1
- Stores a flat list of meal objects sorted by `order` asc

### Methods

| Method | Description |
|---|---|
| `async get_meals()` | Returns full list sorted by `order` asc |
| `async add_meal(name, in_freezer)` | Appends with next order index |
| `async update_meal(id, name, in_freezer)` | Patches name and/or freezer flag |
| `async mark_eaten(id)` | Sets `eaten: true`, moves item to end (order = max+1) |
| `async reorder(ids: list[str])` | Receives full ordered list of IDs, rewrites order values |
| `async delete_meal(id)` | Removes by ID |

---

## Entities (`sensor.py`)

Two sensor entities, always reflecting current storage state.

### `sensor.meal_planner_today`

- **Friendly name**: "Today's Meal"
- **State**: Meal name, or `"None"` if queue is empty
- **Attributes**: `in_freezer`, `eaten`, `meal_id`
- **Source**: First un-eaten meal in queue (lowest `order`, `eaten: false`)

### `sensor.meal_planner_tomorrow`

- **Friendly name**: "Tomorrow's Meal"
- **State**: Meal name, or `"None"`
- **Attributes**: `in_freezer`, `eaten`, `meal_id`
- **Source**: Second un-eaten meal in queue

Sensors update via `async_write_ha_state()` immediately whenever storage changes — no polling.

---

## REST API Endpoints (`__init__.py`)

Registered via `homeassistant.components.http.HomeAssistantView`. All endpoints require HA auth (bearer token).

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/meal_planner/meals` | Full list (including eaten) |
| `POST` | `/api/meal_planner/meals` | Add meal `{ name, in_freezer }` |
| `PUT` | `/api/meal_planner/meals/{id}` | Update meal `{ name, in_freezer }` |
| `POST` | `/api/meal_planner/meals/{id}/eaten` | Mark meal as eaten |
| `POST` | `/api/meal_planner/meals/reorder` | Reorder `{ ids: [...] }` |
| `DELETE` | `/api/meal_planner/meals/{id}` | Delete meal |

---

## HA Services (`services.yaml`)

Registered under domain `meal_planner`:

| Service | Fields | Action |
|---|---|---|
| `add_meal` | `name` (str), `in_freezer` (bool) | Adds meal to end of queue |
| `mark_eaten` | `meal_id` (str) | Marks eaten, moves to end |
| `delete_meal` | `meal_id` (str) | Removes meal |
| `reorder_meals` | `ids` (list of str) | Full reorder |

All services call storage methods and trigger sensor refresh.

---

## Frontend Panel (`meal-planner-panel.js`)

Registered as a HA panel at path `/meal-planner`, sidebar icon: `mdi:silverware-fork-knife`.

Implement as a native web component (`customElements.define`). Uses the `hass` object passed by HA for API calls and auth token.

### Layout

- **Header**: "Meal Planner" title + "Add meal" button (opens inline form at top of list)
- **Meal list**: ordered queue, un-eaten meals only by default
- **Toggle**: "Show eaten meals" — reveals eaten items at the bottom, greyed out, delete-only

### Each Meal Card (un-eaten)

```
[≡ drag handle]  [Meal name]  [🧊 Freezer checkbox]  [✓ Mark eaten]  [✎ Edit]  [🗑 Delete]
```

- **Drag handle**: HTML5 native drag-and-drop reorder (no external library). On drop, calls `/reorder` endpoint with new ID order.
- **Freezer checkbox**: Inline toggle, saves immediately on change via `PUT` endpoint.
- **Mark eaten**: Calls `/eaten` endpoint, item moves to eaten section instantly.
- **Edit**: Toggles meal name to an inline `<input>`. Saves on blur or Enter key. Debounced 300ms.
- **Delete**: Requires confirmation before calling `DELETE` endpoint.

### Add Meal Form (inline, shown at top when "Add meal" clicked)

```
[Text input: meal name]  [🧊 In freezer checkbox]  [Add]  [Cancel]
```

### Eaten Meals Section (shown when toggle is active)

- Displayed below active queue, visually distinct (greyed out / lower opacity)
- Each item shows name + freezer flag (read-only) + delete button only
- No reorder, no mark-eaten (already done)

### API Usage in Panel

- Use `hass.callApi()` or `fetch` with `hass.auth.accessToken` as Bearer token for all REST calls
- Subscribe to HA state updates via `hass` object for reactive sensor display (today/tomorrow labels above the list)
- All API calls wrapped in try/catch — show inline error messages in panel (no `alert()`)

---

## `manifest.json`

```json
{
  "domain": "meal_planner",
  "name": "Meal Planner",
  "version": "1.0.0",
  "documentation": "https://github.com/YOUR_USERNAME/ha-meal-planner",
  "issue_tracker": "https://github.com/YOUR_USERNAME/ha-meal-planner/issues",
  "dependencies": [],
  "codeowners": ["@YOUR_USERNAME"],
  "requirements": [],
  "iot_class": "local_push",
  "hacs": "1.0.0"
}
```

---

## `hacs.json`

```json
{
  "name": "Meal Planner",
  "category": "integration"
}
```

---

## Example Automation

Include this in the README as a ready-to-use example:

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

---

## HACS Install Requirements (for README)

1. Have [HACS](https://hacs.xyz) installed in Home Assistant
2. Go to HACS → Integrations → ⋮ menu → Custom repositories
3. Add this repo URL, category: **Integration**
4. Install "Meal Planner" via HACS → restart HA
5. Add to `configuration.yaml`:
   ```yaml
   meal_planner:
   ```
6. Meal Planner appears in the sidebar

---

## Implementation Notes

- All Python must be fully async (`async def` throughout)
- No external Python dependencies — `requirements: []`
- No npm/build step — panel JS must be plain ES2020, single file, no bundler
- HTML5 drag-and-drop for reorder (no SortableJS or similar external library)
- Sensors must update immediately on any storage mutation — no polling
- Debounce inline name edits 300ms before saving to avoid excessive API calls
- Error handling: all fetch/API calls in try/catch, surface errors inline in UI
- Keep OOP structure in Python (MealStorage class, separate view classes per endpoint)
- Good inline comments throughout — code should be self-documenting
