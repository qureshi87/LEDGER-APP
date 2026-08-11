```javascript
/* =========================================================
   STOCK LEDGER
   SUPABASE FIRST + LOCAL FALLBACK
   ========================================================= */

(function () {
  "use strict";

  /* =========================================================
     PREVENT DOUBLE LOAD
  ========================================================= */

  if (window.__stockLedgerAppLoaded) {
    console.warn("Stock Ledger app already loaded.");
    return;
  }

  window.__stockLedgerAppLoaded = true;


  /* =========================================================
     CONFIG
  ========================================================= */

  const STORAGE_KEY = "stock-ledger-entries-v1";

  const SUPABASE_URL =
    "https://rfpvwhqzixqqtvaqktpr.supabase.co";

  const SUPABASE_KEY =
    "sb_publishable_xD8zJ6wUrr_37pwaPak6cg_7hY5CbfC";


  /* =========================================================
     SUPABASE CLIENT
  ========================================================= */

  function getSupabaseClient() {

    if (
      !window.supabase ||
      typeof window.supabase.createClient !== "function"
    ) {
      return null;
    }

    if (!window.__stockLedgerSupabaseClient) {

      window.__stockLedgerSupabaseClient =
        window.supabase.createClient(
          SUPABASE_URL,
          SUPABASE_KEY
        );

    }

    return window.__stockLedgerSupabaseClient;
  }


  /* =========================================================
     DATA
  ========================================================= */

  let entries = [];


  /* =========================================================
     HELPERS
  ========================================================= */

  function $(id) {
    return document.getElementById(id);
  }


  function today() {

    return new Date()
      .toISOString()
      .split("T")[0];

  }


  function money(value) {

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "PKR",
      maximumFractionDigits: 2
    }).format(Number(value || 0));

  }


  function escapeHtml(value) {

    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  }


  function generateId() {

    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return window.crypto.randomUUID();
    }

    return (
      `entry-${Date.now()}-` +
      Math.random().toString(16).slice(2)
    );

  }


  /* =========================================================
     LOCAL STORAGE
  ========================================================= */

  function readLocalEntries() {

    try {

      const raw =
        localStorage.getItem(STORAGE_KEY);

      const parsed =
        raw ? JSON.parse(raw) : [];

      return Array.isArray(parsed)
        ? parsed
        : [];

    } catch (error) {

      console.error(
        "Local storage read failed:",
        error
      );

      return [];

    }

  }


  function saveLocalEntries(list) {

    try {

      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(list)
      );

    } catch (error) {

      console.error(
        "Local storage write failed:",
        error
      );

    }

  }


  /* =========================================================
     NORMALIZE DATABASE ROW
  ========================================================= */

  function normalizeEntry(row = {}) {

    return {

      id:
        row.id ??
        generateId(),

      product:
        String(
          row.product || ""
        ).trim(),

      type:
        row.type ||
        "adjustment",

      quantity:
        Number(
          row.quantity || 0
        ),

      unitPrice:
        Number(
          row.unit_price || 0
        ),

      date:
        row.date ||
        today(),

      counterparty:
        String(
          row.counterparty || ""
        ).trim(),

      note:
        String(
          row.note || ""
        ).trim(),

      adjustmentDirection:
        row.adjustment_direction ||
        "increase",

      createdAt:
        row.created_at ||
        new Date().toISOString()

    };

  }


  /* =========================================================
     LOAD ENTRIES FROM SUPABASE
  ========================================================= */

  async function loadEntries() {

    const client =
      getSupabaseClient();


    /* -------------------------------------------------------
       SUPABASE AVAILABLE
    ------------------------------------------------------- */

    if (client) {

      try {

        const {
          data,
          error
        } = await client
          .from("ledger_entries")
          .select("*")
          .order(
            "date",
            {
              ascending: false
            }
          )
          .order(
            "created_at",
            {
              ascending: false
            }
          );


        if (!error && Array.isArray(data)) {

          entries =
            data.map(
              normalizeEntry
            );

          saveLocalEntries(
            entries
          );

          render();

          return true;

        }


        console.error(
          "Supabase load error:",
          error
        );

      } catch (error) {

        console.error(
          "Supabase connection error:",
          error
        );

      }

    }


    /* -------------------------------------------------------
       LOCAL FALLBACK ONLY WHEN SUPABASE IS UNAVAILABLE
    ------------------------------------------------------- */

    entries =
      readLocalEntries()
        .map(normalizeEntry);

    render();

    return false;

  }


  /* =========================================================
     INVENTORY
  ========================================================= */

  function getInventory() {

    const inventory = {};


    entries.forEach(
      (entry) => {

        const product =
          String(
            entry.product || ""
          ).trim();


        if (!product) {
          return;
        }


        if (!inventory[product]) {

          inventory[product] = {

            quantity: 0,

            totalCost: 0,

            costQuantity: 0,

            averageCost: 0,

            stockValue: 0

          };

        }


        const item =
          inventory[product];


        /* RECEIVED */

        if (
          entry.type === "received"
        ) {

          item.quantity +=
            entry.quantity;

          item.totalCost +=
            entry.quantity *
            entry.unitPrice;

          item.costQuantity +=
            entry.quantity;

        }


        /* ISSUED */

        else if (
          entry.type === "issued"
        ) {

          item.quantity -=
            entry.quantity;

        }


        /* ADJUSTMENT */

        else if (
          entry.type === "adjustment"
        ) {

          if (
            entry.adjustmentDirection ===
            "increase"
          ) {

            item.quantity +=
              entry.quantity;


            if (
              entry.unitPrice > 0
            ) {

              item.totalCost +=
                entry.quantity *
                entry.unitPrice;

              item.costQuantity +=
                entry.quantity;

            }

          } else {

            item.quantity -=
              entry.quantity;

          }

        }

      }
    );


    Object.values(
      inventory
    ).forEach(
      (item) => {

        if (
          item.costQuantity > 0
        ) {

          item.averageCost =
            item.totalCost /
            item.costQuantity;

        }


        item.stockValue =
          Math.max(
            0,
            item.quantity
          ) *
          item.averageCost;

      }
    );


    return inventory;

  }


  /* =========================================================
     DASHBOARD STATS
  ========================================================= */

  function renderStats() {

    const inventory =
      getInventory();


    let inventoryValue = 0;

    let itemsInStock = 0;


    Object.values(
      inventory
    ).forEach(
      (item) => {

        inventoryValue +=
          item.stockValue;

        itemsInStock +=
          Math.max(
            0,
            item.quantity
          );

      }
    );


    const receivedValue =
      entries
        .filter(
          (entry) =>
            entry.type === "received"
        )
        .reduce(
          (total, entry) =>
            total +
            entry.quantity *
            entry.unitPrice,
          0
        );


    const issuedValue =
      entries
        .filter(
          (entry) =>
            entry.type === "issued"
        )
        .reduce(
          (total, entry) =>
            total +
            entry.quantity *
            entry.unitPrice,
          0
        );


    if ($("inventoryValue")) {

      $("inventoryValue").textContent =
        money(inventoryValue);

    }


    if ($("itemsInStock")) {

      $("itemsInStock").textContent =
        itemsInStock;

    }


    if ($("purchaseCost")) {

      $("purchaseCost").textContent =
        money(receivedValue);

    }


    if ($("salesRevenue")) {

      $("salesRevenue").textContent =
        money(issuedValue);

    }

  }


  /* =========================================================
     STOCK TABLE
  ========================================================= */

  function renderStockTable() {

    const body =
      $("stockTableBody");

    if (!body) return;


    const inventory =
      getInventory();


    const products =
      Object.entries(
        inventory
      ).filter(
        ([, item]) =>
          item.quantity > 0
      );


    if (!products.length) {

      body.innerHTML = `
        <tr>
          <td colspan="4" class="empty-row">
            No stock available
          </td>
        </tr>
      `;

      return;

    }


    body.innerHTML =
      products
        .map(
          ([product, item]) => `

            <tr>

              <td>
                ${escapeHtml(product)}
              </td>

              <td>
                ${item.quantity}
              </td>

              <td>
                ${money(item.averageCost)}
              </td>

              <td>
                ${money(item.stockValue)}
              </td>

            </tr>

          `
        )
        .join("");

  }


  /* =========================================================
     RECEIVED TABLE
  ========================================================= */

  function renderReceivedTable() {

    const body =
      $("receivedTableBody");

    if (!body) return;


    const received =
      entries.filter(
        (entry) =>
          entry.type === "received"
      );


    if (!received.length) {

      body.innerHTML = `
        <tr>
          <td colspan="7" class="empty-row">
            No received stock records
          </td>
        </tr>
      `;

      return;

    }


    body.innerHTML =
      received
        .map(
          (entry) => `

            <tr>

              <td>
                ${escapeHtml(entry.date)}
              </td>

              <td>
                ${escapeHtml(entry.product)}
              </td>

              <td>
                ${entry.quantity}
              </td>

              <td>
                ${money(entry.unitPrice)}
              </td>

              <td>
                ${escapeHtml(entry.counterparty)}
              </td>

              <td>
                ${escapeHtml(entry.note)}
              </td>

              <td>

                <button
                  class="secondary edit-btn"
                  data-id="${entry.id}"
                  type="button"
                >
                  Edit
                </button>

                <button
                  class="delete-btn delete-entry-btn"
                  data-id="${entry.id}"
                  type="button"
                >
                  Delete
                </button>

              </td>

            </tr>

          `
        )
        .join("");

  }


  /* =========================================================
     ISSUED TABLE
  ========================================================= */

  function renderIssuedTable() {

    const body =
      $("issuedTableBody");

    if (!body) return;


    const issued =
      entries.filter(
        (entry) =>
          entry.type === "issued"
      );


    if (!issued.length) {

      body.innerHTML = `
        <tr>
          <td colspan="7" class="empty-row">
            No issued stock records
          </td>
        </tr>
      `;

      return;

    }


    body.innerHTML =
      issued
        .map(
          (entry) => `

            <tr>

              <td>
                ${escapeHtml(entry.date)}
              </td>

              <td>
                ${escapeHtml(entry.product)}
              </td>

              <td>
                ${entry.quantity}
              </td>

              <td>
                ${money(entry.unitPrice)}
              </td>

              <td>
                ${escapeHtml(entry.counterparty)}
              </td>

              <td>
                ${escapeHtml(entry.note)}
              </td>

              <td>

                <button
                  class="secondary edit-btn"
                  data-id="${entry.id}"
                  type="button"
                >
                  Edit
                </button>

                <button
                  class="delete-btn delete-entry-btn"
                  data-id="${entry.id}"
                  type="button"
                >
                  Delete
                </button>

              </td>

            </tr>

          `
        )
        .join("");

  }


  /* =========================================================
     HISTORY TABLE
  ========================================================= */

  function renderHistoryTable() {

    const body =
      $("historyTableBody");

    if (!body) return;


    if (!entries.length) {

      body.innerHTML = `
        <tr>
          <td colspan="7" class="empty-row">
            No history available
          </td>
        </tr>
      `;

      return;

    }


    body.innerHTML =
      entries
        .map(
          (entry) => `

            <tr>

              <td>
                ${escapeHtml(entry.date)}
              </td>

              <td>
                ${escapeHtml(entry.product)}
              </td>

              <td>
                <span class="badge ${escapeHtml(entry.type)}">
                  ${escapeHtml(entry.type)}
                </span>
              </td>

              <td>
                ${entry.quantity}
              </td>

              <td>
                ${money(entry.unitPrice)}
              </td>

              <td>
                ${escapeHtml(entry.counterparty)}
              </td>

              <td>
                ${escapeHtml(entry.note)}
              </td>

            </tr>

          `
        )
        .join("");

  }


  /* =========================================================
     RENDER
  ========================================================= */

  function render() {

    renderStats();

    renderStockTable();

    renderReceivedTable();

    renderIssuedTable();

    renderHistoryTable();

  }


  /* =========================================================
     FORM CONTROL
  ========================================================= */

  function updateFormFields() {

    const type =
      $("type");

    const counterpartyLabel =
      $("counterpartyLabel");

    const adjustmentWrap =
      $("adjustmentWrap");


    if (!type) return;


    if (adjustmentWrap) {

      adjustmentWrap.classList.toggle(
        "hidden",
        type.value !== "adjustment"
      );

    }


    if (!counterpartyLabel) return;


    let labelText = "Reference";

    let placeholder =
      "e.g. Manual adjustment";


    if (
      type.value === "received"
    ) {

      labelText = "Vendor name";

      placeholder =
        "e.g. ABC Supplies";

    }


    if (
      type.value === "issued"
    ) {

      labelText = "Person name";

      placeholder =
        "e.g. Ahmed";

    }


    counterpartyLabel.innerHTML = `

      ${labelText}

      <input
        id="counterparty"
        name="counterparty"
        type="text"
        placeholder="${placeholder}"
      />

    `;

  }


  /* =========================================================
     SAVE TRANSACTION TO SUPABASE
  ========================================================= */

  async function saveTransaction(event) {

    event.preventDefault();


    const product =
      $("product")?.value.trim();

    const type =
      $("type")?.value ||
      "received";

    const quantity =
      Number(
        $("quantity")?.value || 0
      );

    const unitPrice =
      Number(
        $("unitPrice")?.value || 0
      );

    const date =
      $("date")?.value ||
      today();

    const counterparty =
      $("counterparty")?.value.trim() ||
      "";

    const note =
      $("note")?.value.trim() ||
      "";

    const adjustmentDirection =
      $("adjustmentDirection")?.value ||
      "increase";


    /* VALIDATION */

    if (!product) {

      alert(
        "Product name enter karein."
      );

      return;

    }


    if (
      !quantity ||
      quantity <= 0
    ) {

      alert(
        "Valid quantity enter karein."
      );

      return;

    }


    /* =======================================================
       IMPORTANT:
       Database mein sirf actual columns bheje ja rahe hain.
       unitPrice ko remove kar diya gaya hai.
    ======================================================= */

    const row = {

      id:
        generateId(),

      product,

      type,

      quantity,

      unit_price:
        unitPrice,

      date,

      counterparty,

      note,

      adjustment_direction:
        type === "adjustment"
          ? adjustmentDirection
          : "increase"

    };


    const client =
      getSupabaseClient();


    if (!client) {

      alert(
        "Supabase load nahi hua. Internet/CDN check karein."
      );

      return;

    }


    /* =======================================================
       SUPABASE INSERT
    ======================================================= */

    try {

      console.log(
        "Saving transaction to Supabase:",
        row
      );


      const {
        data,
        error
      } = await client
        .from("ledger_entries")
        .insert([row])
        .select()
        .single();


      if (error) {

        console.error(
          "SUPABASE INSERT ERROR:",
          error
        );


        alert(
          "Supabase save error:\n\n" +
          error.message
        );

        return;

      }


      console.log(
        "Transaction saved to Supabase:",
        data
      );


      /* SAVE LOCAL CACHE */

      const savedEntry =
        normalizeEntry(data);


      const localEntries =
        readLocalEntries()
          .map(normalizeEntry)
          .filter(
            (entry) =>
              String(entry.id) !==
              String(savedEntry.id)
          );


      saveLocalEntries([
        savedEntry,
        ...localEntries
      ]);


      entries = [
        savedEntry,
        ...entries.filter(
          (entry) =>
            String(entry.id) !==
            String(savedEntry.id)
        )
      ];


      render();


      /* RESET FORM */

      $("ledgerForm")?.reset();


      if ($("quantity")) {
        $("quantity").value = "1";
      }


      if ($("unitPrice")) {
        $("unitPrice").value = "0";
      }


      if ($("date")) {
        $("date").value = today();
      }


      updateFormFields();


      alert(
        "Transaction Supabase mein successfully save ho gayi."
      );


      /* REFRESH FROM DATABASE */

      await loadEntries();

    } catch (error) {

      console.error(
        "Unexpected Supabase error:",
        error
      );


      alert(
        "Supabase connection error:\n\n" +
        error.message
      );

    }

  }


  /* =========================================================
     DELETE ENTRY
  ========================================================= */

  async function deleteEntry(id) {

    const confirmed =
      confirm(
        "Kya aap is record ko delete karna chahte hain?"
      );


    if (!confirmed) return;


    const client =
      getSupabaseClient();


    if (!client) {

      alert(
        "Supabase connection available nahi hai."
      );

      return;

    }


    try {

      const {
        error
      } = await client
        .from("ledger_entries")
        .delete()
        .eq("id", id);


      if (error) {

        console.error(
          "Delete error:",
          error
        );

        alert(
          "Delete error:\n\n" +
          error.message
        );

        return;

      }


      await loadEntries();


      alert(
        "Record successfully delete ho gaya."
      );

    } catch (error) {

      console.error(
        "Delete failed:",
        error
      );

      alert(
        "Delete error:\n\n" +
        error.message
      );

    }

  }


  /* =========================================================
     EDIT FORM
  ========================================================= */

  function openEditForm(id) {

    const entry =
      entries.find(
        (item) =>
          String(item.id) ===
          String(id)
      );


    if (!entry) {

      alert(
        "Record nahi mila."
      );

      return;

    }


    const panel =
      $("editFormPanel");


    if (!panel) {

      alert(
        "Edit form page par nahi mila."
      );

      return;

    }


    if ($("editEntryId"))
      $("editEntryId").value =
        entry.id;


    if ($("editProduct"))
      $("editProduct").value =
        entry.product;


    if ($("editType"))
      $("editType").value =
        entry.type;


    if ($("editCounterparty"))
      $("editCounterparty").value =
        entry.counterparty;


    if ($("editQuantity"))
      $("editQuantity").value =
        entry.quantity;


    if ($("editUnitPrice"))
      $("editUnitPrice").value =
        entry.unitPrice;


    if ($("editDate"))
      $("editDate").value =
        entry.date;


    if ($("editNote"))
      $("editNote").value =
        entry.note;


    if ($("editAdjustmentDirection"))
      $("editAdjustmentDirection").value =
        entry.adjustmentDirection;


    if ($("editMode"))
      $("editMode").value =
        entry.type;


    panel.classList.remove(
      "hidden"
    );


    panel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  }


  /* =========================================================
     UPDATE ENTRY IN SUPABASE
  ========================================================= */

  async function updateEntry(event) {

    event.preventDefault();


    const id =
      $("editEntryId")?.value;


    if (!id) {

      alert(
        "Record ID missing."
      );

      return;

    }


    const product =
      $("editProduct")?.value.trim();

    const type =
      $("editType")?.value ||
      "received";

    const counterparty =
      $("editCounterparty")?.value.trim() ||
      "";

    const quantity =
      Number(
        $("editQuantity")?.value || 0
      );

    const unitPrice =
      Number(
        $("editUnitPrice")?.value || 0
      );

    const date =
      $("editDate")?.value ||
      today();

    const note =
      $("editNote")?.value.trim() ||
      "";

    const adjustmentDirection =
      $("editAdjustmentDirection")?.value ||
      "increase";


    if (!product) {

      alert(
        "Product name enter karein."
      );

      return;

    }


    if (
      !quantity ||
      quantity <= 0
    ) {

      alert(
        "Valid quantity enter karein."
      );

      return;

    }


    /* ONLY REAL DATABASE COLUMNS */

    const updates = {

      product,

      type,

      counterparty,

      quantity,

      unit_price:
        unitPrice,

      date,

      note,

      adjustment_direction:
        type === "adjustment"
          ? adjustmentDirection
          : "increase"

    };


    const client =
      getSupabaseClient();


    if (!client) {

      alert(
        "Supabase connection available nahi hai."
      );

      return;

    }


    try {

      const {
        error
      } = await client
        .from("ledger_entries")
        .update(updates)
        .eq("id", id);


      if (error) {

        console.error(
          "Update error:",
          error
        );

        alert(
          "Update error:\n\n" +
          error.message
        );

        return;

      }


      alert(
        "Record Supabase mein successfully update ho gaya."
      );


      closeEditForm();

      await loadEntries();

    } catch (error) {

      console.error(
        "Update failed:",
        error
      );

      alert(
        "Update error:\n\n" +
        error.message
      );

    }

  }


  /* =========================================================
     CLOSE EDIT FORM
  ========================================================= */

  function closeEditForm() {

    const panel =
      $("editFormPanel");


    if (!panel) return;


    panel.classList.add(
      "hidden"
    );


    $("editForm")
      ?.reset();

  }


  /* =========================================================
     TABLE BUTTON ACTIONS
  ========================================================= */

  function setupTableActions() {

    if (
      window.__stockLedgerTableActionsLoaded
    ) {
      return;
    }


    window.__stockLedgerTableActionsLoaded =
      true;


    document.addEventListener(
      "click",
      (event) => {

        const target =
          event.target;


        if (
          !(target instanceof Element)
        ) {
          return;
        }


        const editButton =
          target.closest(
            ".edit-btn"
          );


        if (editButton) {

          openEditForm(
            editButton.dataset.id
          );

          return;

        }


        const deleteButton =
          target.closest(
            ".delete-entry-btn"
          );


        if (deleteButton) {

          deleteEntry(
            deleteButton.dataset.id
          );

        }

      }
    );

  }


  /* =========================================================
     INITIALIZE
  ========================================================= */

  async function initializeApp() {

    /* DATE */

    if ($("date")) {

      $("date").value =
        today();

    }


    /* TYPE */

    if ($("type")) {

      $("type").addEventListener(
        "change",
        updateFormFields
      );

      updateFormFields();

    }


    /* ADD FORM */

    if ($("ledgerForm")) {

      $("ledgerForm").addEventListener(
        "submit",
        saveTransaction
      );

    }


    /* EDIT FORM */

    if ($("editForm")) {

      $("editForm").addEventListener(
        "submit",
        updateEntry
      );

    }


    /* CANCEL EDIT */

    if ($("cancelEditBtn")) {

      $("cancelEditBtn").addEventListener(
        "click",
        closeEditForm
      );

    }


    /* TABLE ACTIONS */

    setupTableActions();


    /* LOAD */

    await loadEntries();


    /* AUTO REFRESH */

    if (
      !window.__stockLedgerRefreshStarted
    ) {

      window.__stockLedgerRefreshStarted =
        true;


      window.__stockLedgerRefreshTimer =
        setInterval(
          loadEntries,
          10000
        );

    }

  }


  /* =========================================================
     DOM READY
  ========================================================= */

  if (
    document.readyState === "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      initializeApp,
      {
        once: true
      }
    );

  } else {

    initializeApp();

  }


})();
```
