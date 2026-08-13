
/* =========================================================
   STOCK LEVEL ALERTS + IMPORTANT REMINDERS
   Add this block at the END of app.js.
   Does not replace Supabase/realtime code.
   ========================================================= */

(function () {
  "use strict";

  const DEFAULT_MIN_STOCK = 50;
  const CRITICAL_STOCK = 20;
  const REMINDER_STORAGE_KEY = "stockLedgerReminders_v1";

  function getCurrentEntries() {
    try {
      if (typeof getEntries === "function") {
        const entries = getEntries();
        return Array.isArray(entries) ? entries : [];
      }
    } catch (error) {
      console.error("Could not read ledger entries:", error);
    }
    return [];
  }

  function calculateAlertStock() {
    const map = {};

    getCurrentEntries().forEach(function (entry) {
      const product = String(entry.product || "").trim();
      if (!product) return;

      if (!map[product]) {
        map[product] = {
          product: product,
          quantity: 0
        };
      }

      const qty = Number(entry.quantity) || 0;

      if (entry.type === "received") {
        map[product].quantity += qty;
      } else if (entry.type === "issued") {
        map[product].quantity -= qty;
      } else if (entry.type === "adjustment") {
        if (entry.adjustmentDirection === "increase") {
          map[product].quantity += qty;
        } else {
          map[product].quantity -= qty;
        }
      }
    });

    return Object.values(map);
  }

  function escapeAlertText(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatAlertNumber(value) {
    return Number(value || 0).toLocaleString("en-US");
  }

  function updateStockAlerts() {
    const container = document.getElementById("stockAlerts");
    const status = document.getElementById("stockAlertStatus");

    if (!container || !status) return;

    const stock = calculateAlertStock();

    const alerts = stock
      .filter(function (item) {
        return item.quantity < DEFAULT_MIN_STOCK;
      })
      .sort(function (a, b) {
        return a.quantity - b.quantity;
      });

    if (!alerts.length) {
      status.textContent = "✓ All stock levels normal";
      status.className = "alert-status good";

      container.innerHTML = `
        <div class="alert-empty">
          ✓ No low-stock items right now.
        </div>
      `;
      return;
    }

    const critical = alerts.some(function (item) {
      return item.quantity <= CRITICAL_STOCK;
    });

    status.textContent =
      alerts.length +
      " Stock Alert" +
      (alerts.length === 1 ? "" : "s");

    status.className =
      "alert-status " +
      (critical ? "danger" : "warning");

    container.innerHTML = alerts.map(function (item) {
      const isCritical = item.quantity <= CRITICAL_STOCK;
      const level = isCritical ? "low" : "medium";
      const icon = isCritical ? "🔴" : "🟡";
      const message = isCritical
        ? "Stock is critically low"
        : "Stock is running low";

      return `
        <div class="stock-alert ${level}">
          <div class="stock-alert-left">
            <div class="stock-alert-icon">${icon}</div>

            <div>
              <div class="stock-alert-name">
                ${escapeAlertText(item.product)}
              </div>

              <div class="stock-alert-message">
                ${message} — minimum level is
                ${DEFAULT_MIN_STOCK} pcs
              </div>
            </div>
          </div>

          <div class="stock-alert-qty">
            <strong>${formatAlertNumber(item.quantity)}</strong>
            <span>pcs remaining</span>
          </div>
        </div>
      `;
    }).join("");
  }

  function getReminders() {
    try {
      const raw = localStorage.getItem(REMINDER_STORAGE_KEY);
      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch (error) {
      return [];
    }
  }

  function saveReminders(reminders) {
    localStorage.setItem(
      REMINDER_STORAGE_KEY,
      JSON.stringify(reminders)
    );
  }

  function renderReminders() {
    const container = document.getElementById("remindersList");
    if (!container) return;

    const reminders = getReminders();

    if (!reminders.length) {
      container.innerHTML = `
        <div class="reminder-empty">
          No reminders added yet.
        </div>
      `;
      return;
    }

    container.innerHTML = reminders.map(function (reminder) {
      return `
        <div class="reminder-item">
          <div class="reminder-pin">📌</div>

          <div class="reminder-text">
            ${escapeAlertText(reminder.text)}
          </div>

          <button
            type="button"
            class="reminder-delete"
            data-delete-reminder="${reminder.id}"
            title="Delete reminder"
          >
            ×
          </button>
        </div>
      `;
    }).join("");

    container
      .querySelectorAll("[data-delete-reminder]")
      .forEach(function (button) {
        button.addEventListener("click", function () {
          const id = String(this.dataset.deleteReminder);

          const updated = getReminders().filter(function (reminder) {
            return String(reminder.id) !== id;
          });

          saveReminders(updated);
          renderReminders();
        });
      });
  }

  function setupReminderForm() {
    const addButton = document.getElementById("addReminderBtn");
    const formWrap = document.getElementById("reminderFormWrap");
    const form = document.getElementById("reminderForm");
    const cancelButton = document.getElementById("cancelReminderBtn");
    const input = document.getElementById("reminderText");

    if (!addButton || !formWrap || !form || !cancelButton || !input) {
      return;
    }

    addButton.addEventListener("click", function () {
      formWrap.classList.remove("hidden");
      input.focus();
    });

    cancelButton.addEventListener("click", function () {
      form.reset();
      formWrap.classList.add("hidden");
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      const text = input.value.trim();
      if (!text) return;

      const reminders = getReminders();

      reminders.unshift({
        id: Date.now(),
        text: text
      });

      saveReminders(reminders);

      form.reset();
      formWrap.classList.add("hidden");
      renderReminders();
    });
  }

  function initializeStockAlertsAndReminders() {
    updateStockAlerts();
    renderReminders();
    setupReminderForm();
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      initializeStockAlertsAndReminders
    );
  } else {
    initializeStockAlertsAndReminders();
  }

  /*
   * Refresh the alert when the existing app changes data.
   * This is only a display refresh; it does not write to Supabase.
   */
  setInterval(updateStockAlerts, 3000);

})();
