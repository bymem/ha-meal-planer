/**
 * Meal Planner dashboard card.
 *
 * Read-only summary card: today's and tomorrow's meal, plus an
 * optional full queue view. Purely reactive via hass.states (the
 * today sensor's `queue` attribute carries the full un-eaten list),
 * so there is no separate REST fetch/poll here.
 *
 * The two options (show_full_list, show_freezer_flag) use HA's
 * built-in getConfigForm() API, so the dashboard's card editor
 * renders a GUI form for them automatically — no hand-built editor
 * element needed.
 */

class MealPlannerCard extends HTMLElement {
  static getConfigForm() {
    return {
      schema: [
        { name: "show_full_list", selector: { boolean: {} } },
        { name: "show_freezer_flag", selector: { boolean: {} } },
      ],
      computeLabel: (schemaItem) =>
        ({
          show_full_list: "Show full meal list",
          show_freezer_flag: "Show freezer flag",
        })[schemaItem.name] || schemaItem.name,
    };
  }

  static getStubConfig() {
    return { show_full_list: true, show_freezer_flag: true };
  }

  setConfig(config) {
    this._config = {
      show_full_list: config.show_full_list !== false,
      show_freezer_flag: config.show_freezer_flag !== false,
    };
    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return this._config && this._config.show_full_list ? 4 : 2;
  }

  _render() {
    if (!this.shadowRoot || !this._hass || !this._config) {
      return;
    }

    const today = this._hass.states["sensor.meal_planner_today"];
    const tomorrow = this._hass.states["sensor.meal_planner_tomorrow"];
    const queue = (today && today.attributes.queue) || [];

    this.shadowRoot.innerHTML = `
      <style>${this._styles()}</style>
      <ha-card header="Meal Planner">
        <div class="content">
          <div class="today-tomorrow">
            <div class="slot">
              <span class="slot-label">Today</span>
              <span class="slot-value">${this._escape(today ? today.state : "—")}</span>
              ${this._freezerBadge(today)}
            </div>
            <div class="slot">
              <span class="slot-label">Tomorrow</span>
              <span class="slot-value">${this._escape(tomorrow ? tomorrow.state : "—")}</span>
              ${this._freezerBadge(tomorrow)}
            </div>
          </div>

          ${this._config.show_full_list ? this._renderQueue(queue) : ""}
        </div>
      </ha-card>
    `;
  }

  _freezerBadge(stateObj) {
    if (!this._config.show_freezer_flag || !stateObj || !stateObj.attributes.in_freezer) {
      return "";
    }
    return '<span class="freezer-badge">Freezer</span>';
  }

  _renderQueue(queue) {
    if (!queue.length) {
      return '<div class="empty">No meals in the queue.</div>';
    }
    return `
      <div class="queue">
        <div class="queue-title">Full queue</div>
        <ol class="queue-list">
          ${queue
            .map(
              (meal) => `
                <li>
                  <span class="name">${this._escape(meal.name)}</span>
                  ${this._config.show_freezer_flag && meal.in_freezer ? '<span class="freezer-badge">Freezer</span>' : ""}
                </li>
              `
            )
            .join("")}
        </ol>
      </div>
    `;
  }

  _escape(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  _styles() {
    return `
      .content { padding: 0 16px 16px; }
      .today-tomorrow { display: flex; gap: 16px; }
      .slot { flex: 1; padding: 10px; border-radius: 8px; background: var(--secondary-background-color, rgba(0, 0, 0, 0.04)); }
      .slot-label { display: block; font-size: 0.8em; opacity: 0.7; }
      .slot-value { font-size: 1.05em; font-weight: 600; }
      .queue { margin-top: 12px; }
      .queue-title { font-size: 0.85em; opacity: 0.7; margin-bottom: 4px; }
      .queue-list { margin: 0; padding-left: 20px; }
      .queue-list li { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
      .freezer-badge { font-size: 0.75em; padding: 2px 8px; border-radius: 10px; background: var(--divider-color, #e0e0e0); opacity: 0.85; }
      .empty { opacity: 0.6; padding: 8px 0 0; font-size: 0.9em; }
    `;
  }
}

customElements.define("meal-planner-card", MealPlannerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "meal-planner-card",
  name: "Meal Planner",
  description: "Shows today's and tomorrow's meal, with an optional full queue view.",
});
