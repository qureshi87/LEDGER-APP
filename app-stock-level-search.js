/* =========================================================
   CUSTOM MINIMUM STOCK LEVEL + CURRENT STOCK SEARCH
   Add this block at the END of your existing app.js.

   IMPORTANT:
   1. This does not replace your existing Supabase/Realtime code.
   2. It uses the existing Supabase client if exposed as
      window.stockLedgerSupabaseClient.
   3. If your existing app uses an IIFE/local client, add this
      one line immediately after createClient():
        window.stockLedgerSupabaseClient = supabaseClient;
   ========================================================= */

(function () {
  "use strict";

  const SETTINGS_TABLE = "product_stock_settings";
  const DEFAULT_MINIMUM = 0;

  let stockSettings = {};
  let searchTerm = "";

  function getClient() {
    return window.stockLedgerSupabaseClient || null;
  }

  function getExistingEntries() {
    if (typeof window.stockLedgerGetEntries === "function") {
      return window.stockLedgerGetEntries();
    }

    try {
      const raw =
        localStorage.getItem("stockLedgerEntries_v4") ||
        localStorage.getItem("stockLedgerEntries_v3");

      const data = raw ? JSON.parse(raw) : [];
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  function escapeText(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function number(value) {
    return Number(value || 0);
  }

  function getInventory() {
    const inventory = {};

    getExistingEntries().forEach((entry) => {
      const product = String(entry.product || "").trim();
      if (!product) return;

      if (!inventory[product]) {
        inventory[product] = 0;
      }

      const qty = number(entry.quantity);

      if (entry.type === "received") {
        inventory[product] += qty;
      } else if (entry.type === "issued") {
        inventory[product] -= qty;
      } else if (entry.type === "adjustment") {
        inventory[product] +=
          entry.adjustmentDirection === "increase"
            ? qty
            : -qty;
      }
    });

    return inventory;
  }

  async function loadStockSettings() {
    const client = getClient();

    if (!client) {
      console.warn(
        "Custom stock levels: Supabase client is not exposed yet."
      );
      renderCustomStockTable();
      return;
    }

    const { data, error } = await client
      .from(SETTINGS_TABLE)
      .select("product, minimum_stock");

    if (error) {
      console.error(
        "Could not load product stock levels:",
        error
      );
      renderCustomStockTable();
      return;
    }

    stockSettings = {};

    (data || []).forEach((row) => {
      stockSettings[String(row.product)] =
        number(row.minimum_stock);
    });

    renderCustomStockTable();
  }

  async function saveStockLevel(product, minimum) {
    const client = getClient();

    if (!client) {
      alert(
        "Supabase is not ready. Please wait a moment and try again."
      );
      return;
    }

    const cleanProduct = String(product || "").trim();
    const cleanMinimum = Math.max(
      0,
      Math.floor(number(minimum))
    );

    if (!cleanProduct) return;

    const { error } = await client
      .from(SETTINGS_TABLE)
      .upsert(
        {
          product: cleanProduct,
          minimum_stock: cleanMinimum
        },
        {
          onConflict: "product"
        }
      );

    if (error) {
      console.error(error);
      alert(
        "Could not save minimum stock level.\n\n" +
        error.message
      );
      return;
    }

    stockSettings[cleanProduct] = cleanMinimum;
    renderCustomStockTable();
  }

  function getStatus(quantity, minimum) {
    if (minimum <= 0) {
      return {
        className: "stock-status-neutral",
        label: "Not Set",
        icon: "⚪"
      };
    }

    if (quantity <= minimum) {
      return {
        className: "stock-status-low",
        label: "LOW",
        icon: "🔴"
      };
    }

    if (quantity <= minimum * 1.5) {
      return {
        className: "stock-status-warning",
        label: "WARNING",
        icon: "🟡"
      };
    }

    return {
      className: "stock-status-good",
      label: "GOOD",
      icon: "🟢"
    };
  }

  function renderCustomStockTable() {
    const tbody =
      document.getElementById("stockTableBody");

    if (!tbody) return;

    const inventory = getInventory();

    const rows = Object.entries(inventory)
      .map(([product, quantity]) => ({
        product,
        quantity: Math.max(0, quantity),
        minimum:
          stockSettings[product] ??
          DEFAULT_MINIMUM
      }))
      .filter((item) => {
        if (!searchTerm) return true;

        return item.product
          .toLowerCase()
          .includes(searchTerm.toLowerCase());
      })
      .sort((a, b) =>
        a.product.localeCompare(b.product)
      );

    if (!rows.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="empty-row">
            ${
              searchTerm
                ? "No matching product found."
                : "No stock available."
            }
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = rows
      .map((item) => {
        const status =
          getStatus(
            item.quantity,
            item.minimum
          );

        return `
          <tr>

            <td>
              <strong>
                ${escapeText(item.product)}
              </strong>
            </td>

            <td>
              ${item.quantity.toLocaleString("en-PK")}
            </td>

            <td>
              <div class="minimum-level-control">

                <input
                  type="number"
                  min="0"
                  step="1"
                  value="${item.minimum}"
                  data-stock-level-product="${escapeText(item.product)}"
                  aria-label="Minimum stock for ${escapeText(item.product)}"
                >

                <button
                  type="button"
                  class="stock-level-save"
                  data-save-stock-level="${escapeText(item.product)}"
                >
                  Save
                </button>

              </div>
            </td>

            <td>
              <span class="stock-status ${status.className}">
                ${status.icon} ${status.label}
              </span>
            </td>

            <td>
              ${
                item.minimum > 0
                  ? Math.max(
                      0,
                      Math.round(
                        (item.quantity /
                          item.minimum) *
                          100
                      )
                    ) + "%"
                  : "—"
              }
            </td>

          </tr>
        `;
      })
      .join("");

    tbody
      .querySelectorAll(
        "[data-save-stock-level]"
      )
      .forEach((button) => {

        button.addEventListener(
          "click",
          async () => {

            const product =
              button.dataset.saveStockLevel;

            const input =
              tbody.querySelector(
                `[data-stock-level-product="${CSS.escape(product)}"]`
              );

            if (!input) return;

            await saveStockLevel(
              product,
              input.value
            );
          }
        );
      });
  }

  function setupSearch() {
    const input =
      document.getElementById("stockSearch");

    const clear =
      document.getElementById(
        "clearStockSearch"
      );

    if (!input) return;

    input.addEventListener(
      "input",
      () => {

        searchTerm =
          input.value.trim();

        if (clear) {
          clear.classList.toggle(
            "hidden",
            !searchTerm
          );
        }

        renderCustomStockTable();
      }
    );

    if (clear) {
      clear.addEventListener(
        "click",
        () => {
          input.value = "";
          searchTerm = "";
          clear.classList.add("hidden");
          renderCustomStockTable();
          input.focus();
        }
      );
    }
  }

  function initializeCustomStockLevels() {
    setupSearch();
    loadStockSettings();

    /*
     * Refresh after the main ledger updates.
     * The main app remains the source of transaction data.
     */
    setInterval(
      () => {
        renderCustomStockTable();
      },
      3000
    );
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      initializeCustomStockLevels
    );
  } else {
    initializeCustomStockLevels();
  }

  /*
   * Expose a small manual refresh hook.
   */
  window.refreshCustomStockLevels =
    loadStockSettings;

})();
