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

    try {

      const data =
        localStorage.getItem(STORAGE_KEY);

      if (!data) {
        return [];
      }

      const parsed =
        JSON.parse(data);

      return Array.isArray(parsed)
        ? parsed
        : [];

    } catch (error) {

      console.error(
        "Unable to load ledger data:",
        error
      );

      return [];

    }

  }


  function saveEntries(entries) {

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries)
    );

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

    const type =
      $("type")?.value;

    const counterpartyLabel =
      $("counterpartyLabel");

    const counterparty =
      $("counterparty");

    const adjustmentWrap =
      $("adjustmentWrap");

    if (
      !counterpartyLabel ||
      !counterparty ||
      !adjustmentWrap
    ) {
      return;
    }


    if (type === "adjustment") {

      adjustmentWrap.classList.remove(
        "hidden"
      );

      counterpartyLabel.classList.add(
        "hidden"
      );

      counterparty.value = "";

    } else {

      adjustmentWrap.classList.add(
        "hidden"
      );

      counterpartyLabel.classList.remove(
        "hidden"
      );


      if (type === "received") {

        counterparty.placeholder =
          "e.g. ABC Supplies";

      } else {

        counterparty.placeholder =
          "e.g. Customer / Worker";

      }

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
      Number(
        $("unitPrice")?.value
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

    if (
      !Number.isFinite(unitPrice) ||
      unitPrice < 0
    ) {
      alert(
        "Please enter a valid unit price."
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

      `;


      tbody.appendChild(row);

    });

  }


  /* =======================================================
     ISSUED PAGE
  ======================================================= */

  function renderIssuedPage() {

    const tbody =
      $("issuedTableBody");

    if (!tbody) {
      return;
    }


    const entries =
      getEntries()
        .filter(
          entry =>
            entry.type ===
            "issued"
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
            No issued stock yet.
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

      `;


      tbody.appendChild(row);

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