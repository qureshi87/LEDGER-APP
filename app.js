"use strict";

(function () {

  /*
  =========================================================
  STOCK LEDGER
  LOCAL VERSION
  Supabase will be connected after local testing
  =========================================================
  */

  if (window.__stockLedgerAppLoaded) {
    console.warn("Stock Ledger already loaded.");
    return;
  }

  window.__stockLedgerAppLoaded = true;



  /* =======================================================
     SUPABASE / ONLINE STORAGE
     ======================================================= */

  const STORAGE_KEY = "stockLedgerEntries_v4";

  // LEDGER-APP Supabase project URL from your Supabase dashboard.
  const SUPABASE_URL =
    "https://uizwbjtthrypsxtosfnc.supabase.co";

  /*
    IMPORTANT:
    Replace the value below with the Publishable key from:
    Supabase > Project Settings > API Keys

    Do NOT use the key from the old Supabase project.
  */
  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_nHin134kT1kqB8Q42NWAVw_c2EYkJWU";

  let supabaseClient = null;
  let ledgerEntries = [];
  let realtimeChannel = null;

  function getEntries() {
    return Array.isArray(ledgerEntries) ? ledgerEntries : [];
  }

  function saveEntries(entries) {
    // Local backup only. Supabase remains the main source of truth.
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Array.isArray(entries) ? entries : [])
      );
    } catch (error) {
      console.warn("Unable to save local backup:", error);
    }
  }

  function loadLocalBackup() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) return [];

      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("Unable to load local backup:", error);
      return [];
    }
  }

  function normalizeEntry(row) {
    return {
      id: row.id,
      product: row.product || "",
      type: row.type || "adjustment",
      counterparty: row.counterparty || "",
      adjustmentDirection:
        row.adjustment_direction ||
        row.adjustmentDirection ||
        null,
      quantity: Number(row.quantity || 0),
      unitPrice: Number(
        row.unit_price ?? row.unitPrice ?? 0
      ),
      date: row.date || "",
      note: row.note || "",
      createdAt:
        row.created_at ||
        row.createdAt ||
        ""
    };
  }

  function toDbEntry(entry) {
    return {
      id: entry.id,
      product: String(entry.product || "").trim(),
      type: entry.type,
      counterparty: String(entry.counterparty || ""),
      adjustment_direction:
        entry.type === "adjustment"
          ? (entry.adjustmentDirection || "increase")
          : null,
      quantity: Number(entry.quantity || 0),
      unit_price: Number(entry.unitPrice || 0),
      date: entry.date,
      note: String(entry.note || "")
    };
  }

  async function ensureSupabase() {
    if (supabaseClient) return supabaseClient;

    if (
      !SUPABASE_PUBLISHABLE_KEY ||
      SUPABASE_PUBLISHABLE_KEY ===
        "REPLACE_WITH_LEDGER_APP_PUBLISHABLE_KEY"
    ) {
      throw new Error(
        "LEDGER-APP Supabase Publishable Key is missing. " +
        "Open Supabase > Project Settings > API Keys and paste the Publishable key into app.js."
      );
    }

    if (
      window.supabase &&
      typeof window.supabase.createClient === "function"
    ) {
      supabaseClient = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
      );
      return supabaseClient;
    }

    await new Promise((resolve, reject) => {
      const existing =
        document.querySelector(
          'script[data-supabase-loader]'
        );

      if (existing) {
        const started = Date.now();

        const timer = setInterval(() => {
          if (
            window.supabase &&
            typeof window.supabase.createClient === "function"
          ) {
            clearInterval(timer);
            resolve();
          } else if (Date.now() - started > 10000) {
            clearInterval(timer);
            reject(
              new Error(
                "Supabase library did not load."
              )
            );
          }
        }, 50);

        return;
      }

      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.dataset.supabaseLoader = "true";
      script.onload = resolve;
      script.onerror = () =>
        reject(
          new Error(
            "Could not load Supabase library."
          )
        );

      document.head.appendChild(script);
    });

    if (
      !window.supabase ||
      typeof window.supabase.createClient !== "function"
    ) {
      throw new Error(
        "Supabase library is not available."
      );
    }

    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    );

    return supabaseClient;
  }

  async function refreshEntries() {
    const client = await ensureSupabase();

    const { data, error } = await client
      .from("ledger_entries")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error(
        "Supabase load error:",
        error
      );
      throw error;
    }

    ledgerEntries = (data || []).map(normalizeEntry);
    saveEntries(ledgerEntries);
    renderCurrentPage();

    return ledgerEntries;
  }

  function subscribeToRealtime() {
    if (!supabaseClient) return;

    if (realtimeChannel) {
      try {
        supabaseClient.removeChannel(
          realtimeChannel
        );
      } catch (error) {
        console.warn(
          "Could not remove old realtime channel:",
          error
        );
      }
    }

    realtimeChannel = supabaseClient
      .channel("ledger_entries_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ledger_entries"
        },
        (payload) => {
          console.log(
            "Ledger realtime event:",
            payload.eventType
          );

          if (payload.eventType === "INSERT") {
            const incoming =
              normalizeEntry(payload.new);

            const exists = ledgerEntries.some(
              (entry) =>
                String(entry.id) ===
                String(incoming.id)
            );

            if (!exists) {
              ledgerEntries.push(incoming);
            }
          }

          if (payload.eventType === "UPDATE") {
            const updated =
              normalizeEntry(payload.new);

            ledgerEntries = ledgerEntries.map(
              (entry) =>
                String(entry.id) ===
                String(updated.id)
                  ? updated
                  : entry
            );
          }

          if (payload.eventType === "DELETE") {
            const deletedId =
              String(payload.old?.id || "");

            ledgerEntries =
              ledgerEntries.filter(
                (entry) =>
                  String(entry.id) !==
                  deletedId
              );
          }

          saveEntries(ledgerEntries);
          renderCurrentPage();
        }
      )
      .subscribe((status) => {
        console.log(
          "Ledger realtime status:",
          status
        );
      });

    return realtimeChannel;
  }

  async function initializeOnlineLedger() {
    try {
      await ensureSupabase();
      await refreshEntries();
      subscribeToRealtime();

      console.log(
        "Stock Ledger connected to Supabase Realtime."
      );

      return true;
    } catch (error) {
      console.error(
        "Supabase initialization failed:",
        error
      );

      // Keep the last local copy visible, but make it clear
      // that this device is not synchronized until Supabase connects.
      ledgerEntries = loadLocalBackup();
      renderCurrentPage();

      alert(
        "Supabase connection failed.\n\n" +
        error.message +
        "\n\n" +
        "Check the LEDGER-APP Publishable Key, Supabase RLS policies, and Realtime setting."
      );

      return false;
    }
  }


  /* =======================================================
     HELPERS
  ======================================================= */

  const $ = (id) => document.getElementById(id);


  function getEntries() {
    return Array.isArray(ledgerEntries)
      ? ledgerEntries
      : [];
  }


  function saveEntries(entries) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Array.isArray(entries) ? entries : [])
      );
    } catch (error) {
      console.warn("Unable to save local backup:", error);
    }
  }


  function formatNumber(value) {

    return Number(value || 0)
      .toLocaleString("en-PK");

  }


  function formatCurrency(value) {

    return (
      "PKR " +
      Number(value || 0)
        .toLocaleString("en-PK", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2
        })
    );

  }


  function escapeHtml(value) {

    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  }


  /* =======================================================
     DATE
  ======================================================= */

  function setDefaultDate() {

    const input = $("date");

    if (!input || input.value) {
      return;
    }

    const today =
      new Date();

    const year =
      today.getFullYear();

    const month =
      String(
        today.getMonth() + 1
      ).padStart(2, "0");

    const day =
      String(
        today.getDate()
      ).padStart(2, "0");

    input.value =
      `${year}-${month}-${day}`;

  }


  /* =======================================================
     TRANSACTION UI
  ======================================================= */

  function updateTransactionUI() {

    const type = $("type")?.value;
    const counterpartyLabel = $("counterpartyLabel");
    const counterparty = $("counterparty");
    const adjustmentWrap = $("adjustmentWrap");
    const unitPriceWrap = $("unitPriceWrap");

    if (!counterpartyLabel || !counterparty || !adjustmentWrap) {
      return;
    }

    if (type === "adjustment") {
      adjustmentWrap.classList.remove("hidden");
      counterpartyLabel.classList.add("hidden");
      counterparty.value = "";
    } else {
      adjustmentWrap.classList.add("hidden");
      counterpartyLabel.classList.remove("hidden");
      counterparty.placeholder =
        type === "received"
          ? "e.g. ABC Supplies"
          : "e.g. Customer / Worker";
    }

    // Rate is optional. It is not used/shown for issued stock.
    if (unitPriceWrap) {
      unitPriceWrap.classList.toggle("hidden", type === "issued");
    }

    if (type === "issued" && $("unitPrice")) {
      $("unitPrice").value = "0";
    }
  }


  /* =======================================================
     ADD TRANSACTION
     ======================================================= */

  async function handleFormSubmit(event) {

    event.preventDefault();

    const product =
      $("product")?.value.trim();

    const type =
      $("type")?.value;

    const counterparty =
      $("counterparty")?.value.trim();

    const adjustmentDirection =
      $("adjustmentDirection")?.value;

    const quantity =
      Number(
        $("quantity")?.value
      );

    const unitPrice =
      type === "issued"
        ? 0
        : Number(
            $("unitPrice")?.value || 0
          );

    const date =
      $("date")?.value;

    const note =
      $("note")?.value.trim();

    /* -------------------------------------------------------
       VALIDATION
    ------------------------------------------------------- */

    if (!product) {
      alert(
        "Please enter product name."
      );
      return;
    }

    if (
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      alert(
        "Please enter a valid quantity."
      );
      return;
    }

    if (!date) {
      alert(
        "Please select a date."
      );
      return;
    }

    try {

      const client =
        await ensureSupabase();

      const entry = {

        id:
          (
            window.crypto &&
            typeof window.crypto.randomUUID ===
              "function"
          )
            ? window.crypto.randomUUID()
            : String(Date.now()),

        product,
        type,
        counterparty,

        adjustmentDirection:
          type === "adjustment"
            ? adjustmentDirection
            : null,

        quantity,
        unitPrice,
        date,
        note,

        createdAt:
          new Date().toISOString()

      };

      const { data, error } =
        await client
          .from("ledger_entries")
          .insert([toDbEntry(entry)])
          .select()
          .single();

      if (error) {
        console.error(
          "Supabase insert error:",
          error
        );

        alert(
          "Could not save transaction.\n\n" +
          error.message
        );

        return;
      }

      /*
        Do not rely only on the realtime event here.
        Add the returned database row immediately.
        The realtime handler will ignore it if it
        already exists.
      */
      const savedEntry =
        normalizeEntry(data || entry);

      const exists =
        ledgerEntries.some(
          (item) =>
            String(item.id) ===
            String(savedEntry.id)
        );

      if (!exists) {
        ledgerEntries.push(savedEntry);
      }

      saveEntries(ledgerEntries);
      renderCurrentPage();

      /* -------------------------------------------------------
         RESET
      ------------------------------------------------------- */

      const form =
        $("ledgerForm");

      if (form) {
        form.reset();
      }

      if ($("quantity")) {
        $("quantity").value = "1";
      }

      if ($("unitPrice")) {
        $("unitPrice").value = "0";
      }

      setDefaultDate();
      updateTransactionUI();

      alert(
        "Transaction saved successfully."
      );

    } catch (error) {

      console.error(
        "Transaction save error:",
        error
      );

      alert(
        "Could not save transaction.\n\n" +
        error.message
      );
    }
  }


  /* =======================================================
     STOCK CALCULATION
     ======================================================= */


  /* =======================================================
     STOCK CALCULATION
  ======================================================= */

  function calculateStock(entries) {

    const stock = {};


    entries.forEach((entry) => {

      const product =
        String(
          entry.product || ""
        ).trim();


      if (!product) {
        return;
      }


      if (!stock[product]) {

        stock[product] = {

          quantity: 0,

          receivedQuantity: 0,

          receivedValue: 0,

          issuedQuantity: 0,

          issuedValue: 0

        };

      }


      const quantity =
        Number(entry.quantity) || 0;

      const unitPrice =
        Number(entry.unitPrice) || 0;


      if (
        entry.type ===
        "received"
      ) {

        stock[product].quantity +=
          quantity;

        stock[product].receivedQuantity +=
          quantity;

        stock[product].receivedValue +=
          quantity * unitPrice;

      }


      else if (
        entry.type ===
        "issued"
      ) {

        stock[product].quantity -=
          quantity;

        stock[product].issuedQuantity +=
          quantity;

        stock[product].issuedValue +=
          quantity * unitPrice;

      }


      else if (
        entry.type ===
        "adjustment"
      ) {

        if (
          entry.adjustmentDirection ===
          "increase"
        ) {

          stock[product].quantity +=
            quantity;

        } else {

          stock[product].quantity -=
            quantity;

        }

      }

    });


    return stock;

  }


  /* =======================================================
     DASHBOARD
  ======================================================= */

  function renderDashboard() {

    const entries =
      getEntries();

    const stock =
      calculateStock(entries);


    let inventoryValue = 0;

    let itemsInStock = 0;

    let purchaseCost = 0;

    let salesRevenue = 0;


    Object.values(stock)
      .forEach((item) => {

        const quantity =
          Math.max(
            0,
            item.quantity
          );


        const avgCost =
          item.receivedQuantity > 0

            ? item.receivedValue /
              item.receivedQuantity

            : 0;


        inventoryValue +=
          quantity * avgCost;

        itemsInStock +=
          quantity;

        purchaseCost +=
          item.receivedValue;

        salesRevenue +=
          item.issuedValue;

      });


    if ($("inventoryValue")) {

      $("inventoryValue")
        .textContent =
        formatCurrency(
          inventoryValue
        );

    }


    if ($("itemsInStock")) {

      $("itemsInStock")
        .textContent =
        formatNumber(
          itemsInStock
        );

    }


    if ($("purchaseCost")) {

      $("purchaseCost")
        .textContent =
        formatCurrency(
          purchaseCost
        );

    }


    if ($("salesRevenue")) {

      $("salesRevenue")
        .textContent =
        formatCurrency(
          salesRevenue
        );

    }


    renderStockTable(stock);

  }


  /* =======================================================
     STOCK TABLE
  ======================================================= */

  function renderStockTable(stock) {

    const tbody =
      $("stockTableBody");

    if (!tbody) {
      return;
    }


    tbody.innerHTML = "";


    const products =
      Object.keys(stock)
        .sort();


    if (!products.length) {

      tbody.innerHTML = `
        <tr>
          <td colspan="4">
            No stock available yet.
          </td>
        </tr>
      `;

      return;

    }


    products.forEach((product) => {

      const item =
        stock[product];


      const quantity =
        Math.max(
          0,
          item.quantity
        );


      const avgCost =
        item.receivedQuantity > 0

          ? item.receivedValue /
            item.receivedQuantity

          : 0;


      const stockValue =
        quantity * avgCost;


      const row =
        document.createElement("tr");


      row.innerHTML = `

        <td>
          ${escapeHtml(product)}
        </td>

        <td>
          ${formatNumber(quantity)}
        </td>

        <td>
          ${formatCurrency(avgCost)}
        </td>

        <td>
          ${formatCurrency(stockValue)}
        </td>

      `;


      tbody.appendChild(row);

    });

  }


  /* =======================================================
     RECEIVED PAGE
  ======================================================= */

  function renderReceivedPage() {

    const tbody =
      $("receivedTableBody");

    if (!tbody) {
      return;
    }

    ensureActionHeader(tbody);

    const entries =
      getEntries()
        .filter(
          entry =>
            entry.type ===
            "received"
        )
        .sort(
          (a, b) =>
            new Date(b.date) -
            new Date(a.date)
        );


    tbody.innerHTML = "";


    if (!entries.length) {

      tbody.innerHTML = `
        <tr>
          <td colspan="6">
            No received stock yet.
          </td>
        </tr>
      `;

      return;

    }


    entries.forEach((entry) => {

      const total =
        Number(entry.quantity) *
        Number(entry.unitPrice);


      const row =
        document.createElement("tr");


      row.innerHTML = `

        <td>
          ${escapeHtml(entry.date)}
        </td>

        <td>
          ${escapeHtml(entry.product)}
        </td>

        <td>
          ${escapeHtml(
            entry.counterparty ||
            "-"
          )}
        </td>

        <td>
          ${formatNumber(
            entry.quantity
          )}
        </td>

        <td>
          ${formatCurrency(
            entry.unitPrice
          )}
        </td>

        <td>
          ${formatCurrency(total)}
        </td>

        ${actionButtons(entry)}

      `;


      tbody.appendChild(row);

    });

  }


  /* =======================================================
     ISSUED PAGE
  ======================================================= */

  function renderIssuedPage() {

    const tbody = $("issuedTableBody");
    if (!tbody) return;

    const table = tbody.closest("table");
    const theadRow = table?.querySelector("thead tr");
    if (theadRow) {
      theadRow.innerHTML = `
        <th>Date</th>
        <th>Product</th>
        <th>Vendor / Person</th>
        <th>Quantity</th>
        <th>Actions</th>
      `;
    }

    const entries = getEntries()
      .filter(entry => entry.type === "issued")
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    tbody.innerHTML = "";

    if (!entries.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5">No issued stock yet.</td>
        </tr>
      `;
      return;
    }

    entries.forEach((entry) => {
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${escapeHtml(entry.date)}</td>
        <td>${escapeHtml(entry.product)}</td>
        <td>${escapeHtml(entry.counterparty || "-")}</td>
        <td>${formatNumber(entry.quantity)}</td>
        ${actionButtons(entry)}
      `;

      tbody.appendChild(row);
    });
  }


  /* =======================================================
     HISTORY PAGE
  ======================================================= */

  function renderHistoryPage() {

    const tbody =
      $("historyTableBody");

    if (!tbody) {
      return;
    }

    ensureActionHeader(tbody);

    const entries =
      getEntries()
        .sort(
          (a, b) =>
            new Date(b.date) -
            new Date(a.date)
        );


    tbody.innerHTML = "";


    if (!entries.length) {

      tbody.innerHTML = `
        <tr>
          <td colspan="8">
            No transactions yet.
          </td>
        </tr>
      `;

      return;

    }


    entries.forEach((entry) => {

      const total =
        Number(entry.quantity) *
        Number(entry.unitPrice);


      let typeText =
        entry.type;


      if (
        entry.type ===
        "adjustment"
      ) {

        typeText =
          `Adjustment - ${
            entry.adjustmentDirection
          }`;

      }


      const row =
        document.createElement("tr");


      row.innerHTML = `

        <td>
          ${escapeHtml(entry.date)}
        </td>

        <td>
          ${escapeHtml(entry.product)}
        </td>

        <td>
          ${escapeHtml(typeText)}
        </td>

        <td>
          ${escapeHtml(
            entry.counterparty ||
            "-"
          )}
        </td>

        <td>
          ${formatNumber(
            entry.quantity
          )}
        </td>

        <td>
          ${formatCurrency(
            entry.unitPrice
          )}
        </td>

        <td>
          ${formatCurrency(total)}
        </td>

        <td>
          ${escapeHtml(
            entry.note ||
            "-"
          )}
        </td>

        ${actionButtons(entry)}

      `;


      tbody.appendChild(row);

    });

  }


  /* =======================================================
     EDIT / DELETE / PRINT REPORT
  ======================================================= */

  function findEntryById(id) {
    return getEntries().find(
      entry => String(entry.id) === String(id)
    );
  }

  function ensureActionHeader(tbody) {
    const table = tbody?.closest("table");
    const theadRow = table?.querySelector("thead tr");
    if (!theadRow) return;

    if (!theadRow.querySelector(".actions-header")) {
      const th = document.createElement("th");
      th.className = "actions-header";
      th.textContent = "Actions";
      theadRow.appendChild(th);
    }
  }

  function actionButtons(entry) {
    const id = escapeHtml(entry.id);
    return `
      <td class="ledger-actions">
        <button type="button" class="table-action edit" data-ledger-edit="${id}">Edit</button>
        <button type="button" class="table-action delete" data-ledger-delete="${id}">Delete</button>
      </td>
    `;
  }

  function showEditModal(entry) {
    if (!entry) return;

    let modal = $("ledgerEditModal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "ledgerEditModal";
      modal.className = "ledger-modal";
      modal.innerHTML = `
        <div class="ledger-modal-backdrop" data-ledger-close></div>
        <div class="ledger-modal-card" role="dialog" aria-modal="true" aria-labelledby="ledgerEditTitle">
          <div class="ledger-modal-head">
            <div>
              <p class="ledger-modal-eyebrow">Transaction Management</p>
              <h3 id="ledgerEditTitle">Edit Transaction</h3>
            </div>
            <button type="button" class="ledger-modal-close" data-ledger-close aria-label="Close">×</button>
          </div>
          <form id="ledgerEditForm" class="ledger-edit-form">
            <div class="ledger-edit-grid">
              <label>Product Name<input id="editProduct" required></label>
              <label>Transaction Type
                <select id="editType">
                  <option value="received">Received</option>
                  <option value="issued">Issued</option>
                  <option value="adjustment">Adjustment</option>
                </select>
              </label>
              <label id="editCounterpartyWrap">Vendor / Person<input id="editCounterparty"></label>
              <label id="editAdjustmentWrap" class="hidden">Adjustment
                <select id="editAdjustmentDirection">
                  <option value="increase">Increase Stock</option>
                  <option value="decrease">Decrease Stock</option>
                </select>
              </label>
              <label>Quantity<input id="editQuantity" type="number" min="1" step="1" required></label>
              <label id="editUnitPriceWrap">Unit Price (Optional)<input id="editUnitPrice" type="number" min="0" step="0.01"></label>
              <label>Date<input id="editDate" type="date" required></label>
            </div>
            <label>Notes<textarea id="editNote" rows="3"></textarea></label>
            <div class="ledger-modal-actions">
              <button type="button" class="secondary" data-ledger-close>Cancel</button>
              <button type="submit" class="primary">Save Changes</button>
            </div>
          </form>
        </div>`;
      document.body.appendChild(modal);

      modal.querySelectorAll("[data-ledger-close]").forEach(btn =>
        btn.addEventListener("click", () => modal.remove())
      );

      $("editType").addEventListener("change", updateEditModalUI);
      $("ledgerEditForm").addEventListener("submit", handleEditSubmit);
    }

    modal.dataset.entryId = String(entry.id);
    $("editProduct").value = entry.product || "";
    $("editType").value = entry.type || "received";
    $("editCounterparty").value = entry.counterparty || "";
    $("editAdjustmentDirection").value = entry.adjustmentDirection || "increase";
    $("editQuantity").value = Number(entry.quantity || 0);
    $("editUnitPrice").value = Number(entry.unitPrice || 0);
    $("editDate").value = entry.date || "";
    $("editNote").value = entry.note || "";
    updateEditModalUI();
    modal.classList.add("open");
    setTimeout(() => $("editProduct")?.focus(), 30);
  }

  function updateEditModalUI() {
    const type = $("editType")?.value;
    const counterparty = $("editCounterpartyWrap");
    const adjustment = $("editAdjustmentWrap");
    const unitPriceWrap = $("editUnitPriceWrap");
    if (!counterparty || !adjustment) return;

    if (unitPriceWrap) {
      unitPriceWrap.classList.toggle("hidden", type === "issued");
    }
    if (type === "issued" && $("editUnitPrice")) {
      $("editUnitPrice").value = "0";
    }

    if (type === "adjustment") {
      counterparty.classList.add("hidden");
      adjustment.classList.remove("hidden");
      $("editCounterparty").value = "";
    } else {
      counterparty.classList.remove("hidden");
      adjustment.classList.add("hidden");
    }
  }

  async function handleEditSubmit(event) {
    event.preventDefault();

    const modal = $("ledgerEditModal");
    const id = modal?.dataset.entryId;
    const oldEntry = findEntryById(id);
    if (!oldEntry) return;

    const product = $("editProduct").value.trim();
    const type = $("editType").value;
    const quantity = Number($("editQuantity").value);
    const unitPrice =
      type === "issued"
        ? 0
        : Number($("editUnitPrice").value || 0);
    const date = $("editDate").value;

    if (!product || !Number.isFinite(quantity) || quantity <= 0 ||
        !Number.isFinite(unitPrice) || unitPrice < 0 || !date) {
      alert("Please enter valid transaction details.");
      return;
    }

    const updated = {
      ...oldEntry,
      product,
      type,
      counterparty: type === "adjustment" ? "" : $("editCounterparty").value.trim(),
      adjustmentDirection: type === "adjustment" ? $("editAdjustmentDirection").value : null,
      quantity,
      unitPrice,
      date,
      note: $("editNote").value.trim()
    };

    try {
      const client = await ensureSupabase();
      const { data, error } = await client
        .from("ledger_entries")
        .update(toDbEntry(updated))
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      const saved = normalizeEntry(data || toDbEntry(updated));
      ledgerEntries = getEntries().map(entry =>
        String(entry.id) === String(id) ? saved : entry
      );
      saveEntries(ledgerEntries);
      renderCurrentPage();
      modal.remove();
      alert("Transaction updated successfully.");
    } catch (error) {
      console.error("Transaction update error:", error);
      alert("Could not update transaction.\n\n" + error.message);
    }
  }

  async function deleteEntry(id) {
    const entry = findEntryById(id);
    if (!entry) return;

    const ok = confirm(
      `Delete this transaction?\n\n${entry.date} — ${entry.product}\nQuantity: ${formatNumber(entry.quantity)}\n\nThis action cannot be undone.`
    );
    if (!ok) return;

    try {
      const client = await ensureSupabase();
      const { error } = await client
        .from("ledger_entries")
        .delete()
        .eq("id", id);

      if (error) throw error;

      ledgerEntries = getEntries().filter(
        item => String(item.id) !== String(id)
      );
      saveEntries(ledgerEntries);
      renderCurrentPage();
      alert("Transaction deleted successfully.");
    } catch (error) {
      console.error("Transaction delete error:", error);
      alert("Could not delete transaction.\n\n" + error.message);
    }
  }

  function reportEntries() {
    return getEntries().slice().sort((a, b) => {
      const dateDiff = new Date(b.date) - new Date(a.date);
      return dateDiff || String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }

  function printLedgerReport(filterType = "all") {
    let entries = reportEntries();
    if (filterType !== "all") {
      entries = entries.filter(entry => entry.type === filterType);
    }

    const receivedQty = entries.filter(e => e.type === "received")
      .reduce((sum, e) => sum + Number(e.quantity || 0), 0);
    const issuedQty = entries.filter(e => e.type === "issued")
      .reduce((sum, e) => sum + Number(e.quantity || 0), 0);
    const receivedValue = entries.filter(e => e.type === "received")
      .reduce((sum, e) => sum + Number(e.quantity || 0) * Number(e.unitPrice || 0), 0);
    const issuedValue = entries.filter(e => e.type === "issued")
      .reduce((sum, e) => sum + Number(e.quantity || 0) * Number(e.unitPrice || 0), 0);

    const title = filterType === "received"
      ? "Stock Received Report"
      : filterType === "issued"
        ? "Stock Issued Report"
        : "Stock Ledger Report";

    const rows = entries.map(entry => {
      const type = entry.type === "adjustment"
        ? `Adjustment - ${entry.adjustmentDirection || "increase"}`
        : entry.type.charAt(0).toUpperCase() + entry.type.slice(1);
      const total = Number(entry.quantity || 0) * Number(entry.unitPrice || 0);

      if (filterType === "issued") {
        return `<tr>
          <td>${escapeHtml(entry.date)}</td>
          <td>${escapeHtml(entry.product)}</td>
          <td>${escapeHtml(type)}</td>
          <td>${escapeHtml(entry.counterparty || "-")}</td>
          <td class="num">${formatNumber(entry.quantity)}</td>
          <td>${escapeHtml(entry.note || "-")}</td>
        </tr>`;
      }

      return `<tr>
        <td>${escapeHtml(entry.date)}</td>
        <td>${escapeHtml(entry.product)}</td>
        <td>${escapeHtml(type)}</td>
        <td>${escapeHtml(entry.counterparty || "-")}</td>
        <td class="num">${formatNumber(entry.quantity)}</td>
        <td class="num">${formatCurrency(entry.unitPrice)}</td>
        <td class="num">${formatCurrency(total)}</td>
        <td>${escapeHtml(entry.note || "-")}</td>
      </tr>`;
    }).join("");

    const win = window.open("", "_blank", "width=1200,height=800");
    if (!win) {
      alert("Please allow pop-ups to print the report.");
      return;
    }

    const generated = new Date().toLocaleString("en-PK");
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
      <style>
        *{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;margin:0;padding:28px;background:#fff}
        .head{display:flex;justify-content:space-between;gap:20px;border-bottom:2px solid #2563eb;padding-bottom:16px;margin-bottom:18px}
        h1{margin:0 0 5px;font-size:28px}.muted{color:#64748b;font-size:12px}
        .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}
        .card{border:1px solid #e2e8f0;border-radius:10px;padding:12px}.card span{display:block;color:#64748b;font-size:11px}.card strong{font-size:18px}
        table{width:100%;border-collapse:collapse;margin-top:15px}th,td{border:1px solid #dbe2ea;padding:8px;font-size:11px;text-align:left}th{background:#f1f5f9;text-transform:uppercase;font-size:10px}.num{text-align:right;white-space:nowrap}
        .footer{margin-top:22px;color:#64748b;font-size:10px} @media print{body{padding:10px}.summary{grid-template-columns:repeat(4,1fr)}}
      </style></head><body>
      <div class="head"><div><h1>${escapeHtml(title)}</h1><div class="muted">Stock Ledger • Central Inventory Management</div></div><div class="muted">Generated: ${escapeHtml(generated)}</div></div>
      <div class="summary">
        <div class="card"><span>Transactions</span><strong>${formatNumber(entries.length)}</strong></div>
        <div class="card"><span>Received Quantity</span><strong>${formatNumber(receivedQty)}</strong></div>
        <div class="card"><span>Issued Quantity</span><strong>${formatNumber(issuedQty)}</strong></div>
        <div class="card"><span>Transaction Value</span><strong>${formatCurrency(receivedValue + issuedValue)}</strong></div>
      </div>
      <table><thead><tr>${filterType === "issued"
        ? "<th>Date</th><th>Product</th><th>Type</th><th>Vendor / Person</th><th>Quantity</th><th>Notes</th>"
        : "<th>Date</th><th>Product</th><th>Type</th><th>Vendor / Person</th><th>Quantity</th><th>Unit Price</th><th>Total</th><th>Notes</th>"
      }</tr></thead><tbody>${rows || (filterType === "issued"
        ? '<tr><td colspan="6">No transactions found.</td></tr>'
        : '<tr><td colspan="8">No transactions found.</td></tr>')}</tbody></table>
      <div class="footer">This report was generated from the current Stock Ledger data.</div>
      <script>window.onload=function(){window.print();}</script></body></html>`);
    win.document.close();
  }

  function injectReportControls() {
    const page = location.pathname.toLowerCase();

    // Keep the Dashboard clean: print reports are available on
    // Received, Issued and History pages only.
    if (page.endsWith("/index.html") || page.endsWith("/") || page === "") {
      return;
    }

    const type = page.includes("received") ? "received" : page.includes("issued") ? "issued" : "all";
    const header = document.querySelector(".section-header");
    if (!header || header.querySelector(".report-toolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.className = "report-toolbar";
    toolbar.innerHTML = `<button type="button" class="report-btn">Print ${type === "received" ? "Received" : type === "issued" ? "Issued" : "Ledger"} Report</button>`;
    toolbar.querySelector("button").addEventListener("click", () => printLedgerReport(type));
    header.appendChild(toolbar);
  }

  function bindTableActions() {
    document.querySelectorAll("[data-ledger-edit]").forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => showEditModal(findEntryById(btn.dataset.ledgerEdit)));
    });
    document.querySelectorAll("[data-ledger-delete]").forEach(btn => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", () => deleteEntry(btn.dataset.ledgerDelete));
    });
  }

  /* =======================================================
     CURRENT PAGE
  ======================================================= */

  function renderCurrentPage() {

    renderDashboard();

    renderReceivedPage();

    renderIssuedPage();

    renderHistoryPage();
    injectReportControls();
    bindTableActions();

  }



  /* =======================================================
     INITIALIZE
     ======================================================= */

  async function init() {

    setDefaultDate();

    updateTransactionUI();

    /*
      Render the last local backup immediately while the
      online database is loading.
    */
    ledgerEntries = loadLocalBackup();
    renderCurrentPage();

    const form =
      $("ledgerForm");

    if (form) {

      form.addEventListener(
        "submit",
        handleFormSubmit
      );

    }

    const type =
      $("type");

    if (type) {

      type.addEventListener(
        "change",
        updateTransactionUI
      );

    }

    await initializeOnlineLedger();
  }


  /* =======================================================
     START
     ======================================================= */


  /* =======================================================
     START
  ======================================================= */

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      () => {
        init().catch((error) => {
          console.error(
            "Stock Ledger initialization error:",
            error
          );
        });
      }
    );

  } else {

    init().catch((error) => {
      console.error(
        "Stock Ledger initialization error:",
        error
      );
    });

  }

})();