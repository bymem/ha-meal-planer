/**
 * Meal Planner sidebar panel.
 *
 * Plain web component, no framework, no build step. Home Assistant
 * instantiates this element and assigns `hass` on every state change,
 * so `set hass()` doubles as the panel's reactive update hook.
 */

const EDIT_DEBOUNCE_MS = 300;

class MealPlannerPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._meals = [];
    this._showEaten = false;
    this._addFormOpen = false;
    this._error = null;
    this._loading = true;
    this._narrow = false;
    this._editDebounceTimers = new Map();
    this._dragMealId = null;

    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this._render();
    this._fetchMeals();
  }

  // Called by Home Assistant with the current hass object whenever
  // state changes (e.g. our own sensors updating) — this is how the
  // today/tomorrow labels stay reactive without any manual polling.
  set hass(hass) {
    const first = this._hass === null;
    this._hass = hass;
    if (first) {
      this._render();
    } else {
      this._renderTodayTomorrow();
    }
  }

  get hass() {
    return this._hass;
  }

  // Home Assistant sets this property on every custom panel element to
  // indicate mobile/narrow-viewport layout. Reflected as a host
  // attribute so :host([narrow]) rules in _styles() can react to it
  // without needing a full re-render.
  set narrow(value) {
    this._narrow = !!value;
    this.toggleAttribute("narrow", this._narrow);
  }

  get narrow() {
    return this._narrow;
  }

  // ---- Data loading -------------------------------------------------

  async _fetchMeals() {
    this._loading = true;
    this._error = null;
    this._render();
    try {
      this._meals = await this._hass.callApi("GET", "meal_planner/meals");
    } catch (err) {
      this._error = `Failed to load meals: ${this._errorMessage(err)}`;
    } finally {
      this._loading = false;
      this._render();
    }
  }

  _errorMessage(err) {
    return err && err.message ? err.message : String(err);
  }

  // ---- Mutations ------------------------------------------------------

  async _addMeal(name, inFreezer) {
    try {
      await this._hass.callApi("POST", "meal_planner/meals", {
        name,
        in_freezer: inFreezer,
      });
      this._addFormOpen = false;
      await this._fetchMeals();
    } catch (err) {
      this._error = `Failed to add meal: ${this._errorMessage(err)}`;
      this._render();
    }
  }

  async _updateMeal(id, patch) {
    try {
      await this._hass.callApi("PUT", `meal_planner/meals/${id}`, patch);
      await this._fetchMeals();
    } catch (err) {
      this._error = `Failed to update meal: ${this._errorMessage(err)}`;
      this._render();
    }
  }

  async _markEaten(id) {
    try {
      await this._hass.callApi("POST", `meal_planner/meals/${id}/eaten`);
      await this._fetchMeals();
    } catch (err) {
      this._error = `Failed to mark meal eaten: ${this._errorMessage(err)}`;
      this._render();
    }
  }

  async _deleteMeal(id) {
    try {
      await this._hass.callApi("DELETE", `meal_planner/meals/${id}`);
      await this._fetchMeals();
    } catch (err) {
      this._error = `Failed to delete meal: ${this._errorMessage(err)}`;
      this._render();
    }
  }

  async _reorder(ids) {
    try {
      await this._hass.callApi("POST", "meal_planner/meals/reorder", { ids });
      await this._fetchMeals();
    } catch (err) {
      this._error = `Failed to reorder meals: ${this._errorMessage(err)}`;
      this._render();
    }
  }

  // ---- Rendering ------------------------------------------------------

  _render() {
    if (!this.shadowRoot) {
      return;
    }

    const active = this._meals.filter((m) => !m.eaten).sort((a, b) => a.order - b.order);
    const eaten = this._meals.filter((m) => m.eaten).sort((a, b) => a.order - b.order);

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <div class="panel">
        <div class="header">
          <ha-menu-button></ha-menu-button>
          <h1>Meal Planner</h1>
          <ha-icon-button
            id="add-toggle"
            label="${this._addFormOpen ? "Cancel" : "Add meal"}"
          >
            <ha-icon icon="${this._addFormOpen ? "mdi:close" : "mdi:plus"}"></ha-icon>
          </ha-icon-button>
        </div>

        <div class="today-tomorrow" id="today-tomorrow"></div>

        ${this._error ? `<div class="error">${this._escape(this._error)}</div>` : ""}

        ${this._addFormOpen ? this._renderAddForm() : ""}

        ${this._loading ? `<div class="loading">Loading…</div>` : ""}

        <div class="list" id="active-list">
          ${active.map((m) => this._renderMealCard(m)).join("") || (!this._loading ? '<div class="empty">No meals in the queue.</div>' : "")}
        </div>

        <label class="show-eaten">
          <input type="checkbox" id="show-eaten" ${this._showEaten ? "checked" : ""} />
          Show eaten meals
        </label>

        ${this._showEaten ? `
          <div class="list eaten-list">
            ${eaten.map((m) => this._renderEatenCard(m)).join("") || '<div class="empty">No eaten meals yet.</div>'}
          </div>
        ` : ""}
      </div>
    `;

    this._renderTodayTomorrow();
    this._attachListeners();
  }

  _renderTodayTomorrow() {
    const container = this.shadowRoot && this.shadowRoot.getElementById("today-tomorrow");
    if (!container || !this._hass) {
      return;
    }
    const today = this._hass.states["sensor.meal_planner_today"];
    const tomorrow = this._hass.states["sensor.meal_planner_tomorrow"];
    container.innerHTML = `
      <div class="slot">
        <span class="slot-label">Today</span>
        <span class="slot-value">${this._escape(today ? today.state : "—")}</span>
        ${today && today.attributes.in_freezer ? '<span class="freezer-badge">Freezer</span>' : ""}
      </div>
      <div class="slot">
        <span class="slot-label">Tomorrow</span>
        <span class="slot-value">${this._escape(tomorrow ? tomorrow.state : "—")}</span>
        ${tomorrow && tomorrow.attributes.in_freezer ? '<span class="freezer-badge">Freezer</span>' : ""}
      </div>
    `;
  }

  _renderAddForm() {
    return `
      <form class="add-form" id="add-form">
        <input type="text" id="add-name" placeholder="Meal name" required />
        <div class="switch-wrap">
          <span class="switch-label">Freezer</span>
          <button type="button" class="switch" id="add-in-freezer-toggle" role="switch" aria-checked="false"></button>
        </div>
        <button type="submit" class="btn primary">Add</button>
        <button type="button" class="btn" id="add-cancel">Cancel</button>
      </form>
    `;
  }

  _renderMealCard(meal) {
    return `
      <div class="card" draggable="true" data-id="${meal.id}">
        <span class="drag-handle" title="Drag to reorder">
          <ha-icon icon="mdi:drag"></ha-icon>
        </span>
        <span class="name" data-id="${meal.id}">${this._escape(meal.name)}</span>
        <div class="card-actions">
          <div class="switch-wrap">
            <span class="switch-label">Freezer</span>
            <button
              class="switch freezer-toggle"
              data-id="${meal.id}"
              role="switch"
              aria-checked="${meal.in_freezer ? "true" : "false"}"
            ></button>
          </div>
          <ha-icon-button class="eat-btn" data-id="${meal.id}" label="Mark eaten">
            <ha-icon icon="mdi:check"></ha-icon>
          </ha-icon-button>
          <ha-icon-button class="edit-btn" data-id="${meal.id}" label="Edit">
            <ha-icon icon="mdi:pencil"></ha-icon>
          </ha-icon-button>
          <ha-icon-button class="danger delete-btn" data-id="${meal.id}" label="Delete">
            <ha-icon icon="mdi:delete"></ha-icon>
          </ha-icon-button>
        </div>
      </div>
    `;
  }

  _renderEatenCard(meal) {
    return `
      <div class="card eaten" data-id="${meal.id}">
        <span class="name">${this._escape(meal.name)}</span>
        ${meal.in_freezer ? '<span class="freezer-badge">Freezer</span>' : ""}
        <div class="card-actions">
          <ha-icon-button class="danger delete-btn" data-id="${meal.id}" label="Delete">
            <ha-icon icon="mdi:delete"></ha-icon>
          </ha-icon-button>
        </div>
      </div>
    `;
  }

  _escape(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // ---- Event wiring ---------------------------------------------------

  _attachListeners() {
    const root = this.shadowRoot;

    root.getElementById("add-toggle").addEventListener("click", () => {
      this._addFormOpen = !this._addFormOpen;
      this._render();
    });

    const addForm = root.getElementById("add-form");
    if (addForm) {
      addForm.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const name = root.getElementById("add-name").value.trim();
        const inFreezer =
          root.getElementById("add-in-freezer-toggle").getAttribute("aria-checked") === "true";
        if (name) {
          this._addMeal(name, inFreezer);
        }
      });
      root.getElementById("add-in-freezer-toggle").addEventListener("click", (ev) => {
        const isOn = ev.currentTarget.getAttribute("aria-checked") === "true";
        ev.currentTarget.setAttribute("aria-checked", String(!isOn));
      });
      root.getElementById("add-cancel").addEventListener("click", () => {
        this._addFormOpen = false;
        this._render();
      });
    }

    root.getElementById("show-eaten").addEventListener("change", (ev) => {
      this._showEaten = ev.target.checked;
      this._render();
    });

    root.querySelectorAll(".freezer-toggle").forEach((el) => {
      el.addEventListener("click", (ev) => {
        const id = ev.currentTarget.dataset.id;
        const meal = this._meals.find((m) => m.id === id);
        this._updateMeal(id, { in_freezer: !(meal && meal.in_freezer) });
      });
    });

    root.querySelectorAll(".eat-btn").forEach((el) => {
      el.addEventListener("click", (ev) => {
        this._markEaten(ev.currentTarget.dataset.id);
      });
    });

    root.querySelectorAll(".edit-btn").forEach((el) => {
      el.addEventListener("click", (ev) => {
        this._startEdit(ev.currentTarget.dataset.id);
      });
    });

    root.querySelectorAll(".delete-btn").forEach((el) => {
      el.addEventListener("click", (ev) => {
        this._confirmDelete(ev.currentTarget.dataset.id, ev.currentTarget);
      });
    });

    this._attachDragListeners();
  }

  _startEdit(id) {
    const root = this.shadowRoot;
    const nameSpan = root.querySelector(`.name[data-id="${id}"]`);
    if (!nameSpan || nameSpan.tagName === "INPUT") {
      return;
    }

    const currentName = this._meals.find((m) => m.id === id)?.name || "";
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentName;
    input.className = "name-edit";
    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const value = input.value.trim();
      if (value && value !== currentName) {
        this._debouncedSaveName(id, value);
      }
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        input.blur();
      } else if (ev.key === "Escape") {
        input.value = currentName;
        input.blur();
      }
    });
  }

  _debouncedSaveName(id, name) {
    if (this._editDebounceTimers.has(id)) {
      clearTimeout(this._editDebounceTimers.get(id));
    }
    const timer = setTimeout(() => {
      this._editDebounceTimers.delete(id);
      this._updateMeal(id, { name });
    }, EDIT_DEBOUNCE_MS);
    this._editDebounceTimers.set(id, timer);
  }

  _confirmDelete(id, buttonEl) {
    if (buttonEl.dataset.confirming === "true") {
      this._deleteMeal(id);
      return;
    }
    const icon = buttonEl.querySelector("ha-icon");
    const originalIcon = icon.getAttribute("icon");
    buttonEl.dataset.confirming = "true";
    buttonEl.label = "Confirm delete?";
    icon.setAttribute("icon", "mdi:delete-alert");
    buttonEl.classList.add("confirming");
    setTimeout(() => {
      if (buttonEl.isConnected) {
        buttonEl.dataset.confirming = "false";
        buttonEl.label = "Delete";
        icon.setAttribute("icon", originalIcon);
        buttonEl.classList.remove("confirming");
      }
    }, 3000);
  }

  // ---- Drag and drop (HTML5 native, no external library) --------------

  _attachDragListeners() {
    const root = this.shadowRoot;
    const list = root.getElementById("active-list");
    if (!list) {
      return;
    }

    list.querySelectorAll(".card").forEach((card) => {
      card.addEventListener("dragstart", (ev) => {
        this._dragMealId = card.dataset.id;
        ev.dataTransfer.effectAllowed = "move";
        card.classList.add("dragging");
      });

      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        this._dragMealId = null;
      });

      card.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        const dragging = list.querySelector(".dragging");
        if (!dragging || dragging === card) {
          return;
        }
        const rect = card.getBoundingClientRect();
        const before = ev.clientY < rect.top + rect.height / 2;
        list.insertBefore(dragging, before ? card : card.nextSibling);
      });

      card.addEventListener("drop", (ev) => {
        ev.preventDefault();
        const ids = Array.from(list.querySelectorAll(".card")).map((c) => c.dataset.id);
        this._reorder(ids);
      });
    });
  }

  _styles() {
    return `
      :host { display: block; font-family: var(--paper-font-body1_-_font-family, sans-serif); }
      .panel { max-width: 720px; margin: 0 auto; padding: 16px; color: var(--primary-text-color); }
      .header { display: flex; align-items: center; gap: 4px; margin-bottom: 12px; }
      .header ha-menu-button { flex-shrink: 0; margin: 0 4px 0 -8px; }
      h1 { font-size: 1.5em; margin: 0; flex: 1; }
      .btn { padding: 8px 14px; border-radius: 4px; border: 1px solid var(--divider-color, #ccc); background: var(--card-background-color, #fff); color: var(--primary-text-color); cursor: pointer; font-size: 0.9em; }
      .btn:hover { background: rgba(0, 0, 0, 0.06); }
      .btn.primary { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); border-color: transparent; }
      ha-icon-button { color: var(--primary-text-color); flex-shrink: 0; }
      ha-icon-button.danger { color: var(--error-color, #db4437); }
      ha-icon-button.confirming { color: #fff; background: var(--error-color, #db4437); border-radius: 50%; }
      .switch-wrap { display: flex; align-items: center; gap: 6px; }
      .switch-label { font-size: 0.8em; opacity: 0.75; }
      .switch { position: relative; width: 36px; height: 20px; padding: 0; border: none; border-radius: 10px; background: var(--switch-unchecked-track-color, #939393); cursor: pointer; flex-shrink: 0; transition: background-color 0.15s ease; }
      .switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4); transition: transform 0.15s ease; }
      .switch[aria-checked="true"] { background: var(--primary-color, #03a9f4); }
      .switch[aria-checked="true"]::after { transform: translateX(16px); }
      .today-tomorrow { display: flex; gap: 16px; margin-bottom: 16px; }
      .slot { flex: 1; padding: 12px; border-radius: 8px; background: var(--card-background-color, #fff); box-shadow: var(--ha-card-box-shadow, 0 1px 3px rgba(0,0,0,0.12)); }
      .slot-label { display: block; font-size: 0.85em; opacity: 0.7; }
      .slot-value { font-size: 1.1em; font-weight: 600; }
      .error { background: var(--error-color, #db4437); color: #fff; padding: 8px 12px; border-radius: 4px; margin-bottom: 12px; }
      .loading { opacity: 0.7; padding: 8px 0; }
      .empty { opacity: 0.6; padding: 12px 0; }
      .add-form { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
      .add-form input[type="text"] { flex: 1; padding: 8px; border-radius: 4px; border: 1px solid var(--divider-color, #ccc); min-width: 160px; }
      .list { display: flex; flex-direction: column; gap: 8px; }
      .card { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 8px; background: var(--card-background-color, #fff); box-shadow: var(--ha-card-box-shadow, 0 1px 3px rgba(0,0,0,0.12)); flex-wrap: wrap; }
      .card.dragging { opacity: 0.4; }
      .card.eaten { opacity: 0.55; }
      .drag-handle { display: flex; cursor: grab; opacity: 0.6; flex-shrink: 0; }
      .name { flex: 1 1 100px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .name-edit { flex: 1; padding: 4px 6px; border-radius: 4px; border: 1px solid var(--divider-color, #ccc); }
      .card-actions { display: flex; align-items: center; gap: 4px; margin-left: auto; flex-wrap: wrap; }
      .freezer-badge { font-size: 0.8em; padding: 2px 8px; border-radius: 10px; background: var(--divider-color, #e0e0e0); opacity: 0.85; }
      .show-eaten { display: flex; align-items: center; gap: 6px; margin: 14px 0; cursor: pointer; }
      .eaten-list { margin-top: 8px; }

      /* Home Assistant sets .narrow on this element for mobile/small
         viewports (see the narrow property setter above). */
      :host([narrow]) .panel { padding: 8px; }
      :host([narrow]) .today-tomorrow { flex-direction: column; gap: 8px; }
      :host([narrow]) .name { white-space: normal; }
    `;
  }
}

customElements.define("meal-planner-panel", MealPlannerPanel);
