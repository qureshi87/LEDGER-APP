/* =========================================================
   STOCK LEDGER
   Safe browser app with Supabase + local fallback
   ========================================================= */

(function () {
  "use strict";

  /* =========================================================
     PREVENT APP FROM LOADING TWICE
  ========================================================= */

  if (window.__stockLedgerAppLoaded) {
    console.warn("Stock Ledger app already loaded.");
    return;
  }

  window.__stockLedgerAppLoaded = true;


  /* =========================================================
     CONFIGURATION
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

      console.warn(
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

      console.warn(
        "Local storage write failed:",
        error
      );

    }

  }


  /* =========================================================
     NORMALIZE ENTRY
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
          row.unit_price ??
          row.unitPrice ??
          0
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
        row.adjustment_direction ??
        row.adjustmentDirection ??
        "increase",

      createdAt:
        row.created_at ??
        row.createdAt ??
        new Date().toISOString()

    };

  }


  /* =========================================================
     LOAD DATA
  ========================================================= */

  async function loadEntries() {

    const client =
      getSupabaseClient();


    /* -------------------------------------------------------
       SUPABASE
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


        if (
          !error &&
          Array.isArray(data)
        ) {

          entries =
            data.map(
              normalizeEntry
            );

          saveLocalEntries(
            entries
          );

          render();

          return;

        }


        console.warn(
          "Supabase load failed, using local storage:",
          error
        );

      } catch (error) {

        console.error(
          "Supabase connection failed:",
          error
        );

      }

    }


    /* -------------------------------------------------------
       LOCAL FALLBACK
    ------------------------------------------------------- */

    entries =
      readLocalEntries()
        .map(normalizeEntry);

    render();

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

      $("inventoryValue")
        .textContent =
        money(
          inventoryValue
        );

    }


    if ($("itemsInStock")) {

      $("itemsInStock")
        .textContent =
        itemsInStock;

    }


    if ($("purchaseCost")) {

      $("purchaseCost")
        .textContent =
        money(
          receivedValue
        );

    }


    if ($("salesRevenue")) {

      $("salesRevenue")
        .textContent =
        money(
          issuedValue
        );

    }

  }


  /* =========================================================
     STOCK TABLE
  ========================================================= */

  function renderStockTable() {

    const body =
      $("stockTableBody");


    if (!body) {
      return;
    }


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
          <td
            colspan="4"
            class="empty-row"
          >
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
                ${money(
                  item.averageCost
                )}
              </td>

              <td>
                ${money(
                  item.stockValue
                )}
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


    if (!body) {
      return;
    }


    const received =
      entries.filter(
        (entry) =>
          entry.type === "received"
      );


    if (!received.length) {

      body.innerHTML = `
        <tr>
          <td
            colspan="7"
            class="empty-row"
          >
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
                ${escapeHtml(
                  entry.date
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.product
                )}
              </td>

              <td>
                ${entry.quantity}
              </td>

              <td>
                ${money(
                  entry.unitPrice
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.counterparty
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.note
                )}
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


    if (!body) {
      return;
    }


    const issued =
      entries.filter(
        (entry) =>
          entry.type === "issued"
      );


    if (!issued.length) {

      body.innerHTML = `
        <tr>
          <td
            colspan="7"
            class="empty-row"
          >
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
                ${escapeHtml(
                  entry.date
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.product
                )}
              </td>

              <td>
                ${entry.quantity}
              </td>

              <td>
                ${money(
                  entry.unitPrice
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.counterparty
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.note
                )}
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


    if (!body) {
      return;
    }


    if (!entries.length) {

      body.innerHTML = `
        <tr>
          <td
            colspan="7"
            class="empty-row"
          >
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
                ${escapeHtml(
                  entry.date
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.product
                )}
              </td>

              <td>

                <span
                  class="badge ${escapeHtml(
                    entry.type
                  )}"
                >
                  ${escapeHtml(
                    entry.type
                  )}
                </span>

              </td>

              <td>
                ${entry.quantity}
              </td>

              <td>
                ${money(
                  entry.unitPrice
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.counterparty
                )}
              </td>

              <td>
                ${escapeHtml(
                  entry.note
                )}
              </td>

            </tr>

          `
        )
        .join("");

  }


  /* =========================================================
     RENDER EVERYTHING
  ========================================================= */

  function render() {

    renderStats();

    renderStockTable();

    renderReceivedTable();

    renderIssuedTable();

    renderHistoryTable();

  }


  /* =========================================================
     FORM FIELD CONTROL
  ========================================================= */

  function updateFormFields() {

    const type =
      $("type");

    const counterpartyLabel =
      $("counterpartyLabel");

    const adjustmentWrap =
      $("adjustmentWrap");


    if (!type) {
      return;
    }


    if (adjustmentWrap) {

      adjustmentWrap.classList.toggle(
        "hidden",
        type.value !== "adjustment"
      );

    }


    if (!counterpartyLabel) {
      return;
    }


    let labelText =
      "Reference";

    let placeholder =
      "e.g. Manual adjustment";


    if (
      type.value === "received"
    ) {

      labelText =
        "Vendor name";

      placeholder =
        "e.g. ABC Supplies";

    }


    else if (
      type.value === "issued"
    ) {

      labelText =
        "Person name";

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
     SAVE TRANSACTION
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


    const row = {

      id:
        generateId(),

      product,

      type,

      quantity,

      unit_price:
        unitPrice,

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


    /* -------------------------------------------------------
       SAVE TO SUPABASE
    ------------------------------------------------------- */

    if (client) {

      try {

        const {
          error
        } = await client
          .from("ledger_entries")
          .insert([row]);


        if (!error) {

          alert(
            "Transaction successfully save ho gayi."
          );


          $("ledgerForm")?.reset();


          if ($("quantity")) {
            $("quantity").value = "1";
          }


          if ($("unitPrice")) {
            $("unitPrice").value = "0";
          }


          if ($("date")) {
            $("date").value =
              today();
          }


          updateFormFields();

          await loadEntries();

          return;

        }


        console.error(
          "Insert error:",
          error
        );

      } catch (error) {

        console.error(
          "Supabase insert failed:",
          error
        );

      }

    }


    /* -------------------------------------------------------
       LOCAL FALLBACK
    ------------------------------------------------------- */

    const nextEntries = [
      normalizeEntry(row),
      ...readLocalEntries()
        .map(normalizeEntry)
    ];


    saveLocalEntries(
      nextEntries
    );


    entries =
      nextEntries;


    render();


    alert(
      "Transaction saved locally."
    );


    $("ledgerForm")?.reset();


    if ($("quantity")) {
      $("quantity").value = "1";
    }


    if ($("unitPrice")) {
      $("unitPrice").value = "0";
    }


    if ($("date")) {
      $("date").value =
        today();
    }


    updateFormFields();

  }


  /* =========================================================
     DELETE ENTRY
  ========================================================= */

  async function deleteEntry(id) {

    const confirmed =
      confirm(
        "Kya aap is record ko delete karna chahte hain?"
      );


    if (!confirmed) {
      return;
    }


    const client =
      getSupabaseClient();


    if (client) {

      try {

        const {
          error
        } = await client
          .from("ledger_entries")
          .delete()
          .eq("id", id);


        if (!error) {

          await loadEntries();

          return;

        }


        console.error(
          "Delete error:",
          error
        );

      } catch (error) {

        console.error(
          "Supabase delete failed:",
          error
        );

      }

    }


    const nextEntries =
      readLocalEntries()
        .map(normalizeEntry)
        .filter(
          (entry) =>
            String(entry.id) !==
            String(id)
        );


    saveLocalEntries(
      nextEntries
    );


    entries =
      nextEntries;


    render();

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
      return;
    }


    if ($("editEntryId")) {
      $("editEntryId").value =
        entry.id;
    }


    if ($("editProduct")) {
      $("editProduct").value =
        entry.product;
    }


    if ($("editType")) {
      $("editType").value =
        entry.type;
    }


    if ($("editCounterparty")) {
      $("editCounterparty").value =
        entry.counterparty;
    }


    if ($("editQuantity")) {
      $("editQuantity").value =
        entry.quantity;
    }


    if ($("editUnitPrice")) {
      $("editUnitPrice").value =
        entry.unitPrice;
    }


    if ($("editDate")) {
      $("editDate").value =
        entry.date;
    }


    if ($("editNote")) {
      $("editNote").value =
        entry.note;
    }


    if (
      $("editAdjustmentDirection")
    ) {

      $("editAdjustmentDirection")
        .value =
        entry.adjustmentDirection;

    }


    if ($("editMode")) {

      $("editMode").value =
        entry.type;

    }


    panel.classList.remove(
      "hidden"
    );


    panel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });

  }


  /* =========================================================
     UPDATE ENTRY
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


    const updates = {

      product,

      type,

      counterparty,

      quantity,

      unit_price:
        unitPrice,

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


    if (client) {

      try {

        const {
          error
        } = await client
          .from("ledger_entries")
          .update(updates)
          .eq("id", id);


        if (!error) {

          alert(
            "Record successfully update ho gaya."
          );


          closeEditForm();

          await loadEntries();

          return;

        }


        console.error(
          "Update error:",
          error
        );

      } catch (error) {

        console.error(
          "Supabase update failed:",
          error
        );

      }

    }


    /* -------------------------------------------------------
       LOCAL UPDATE
    ------------------------------------------------------- */

    const nextEntries =
      readLocalEntries()
        .map(normalizeEntry)
        .map(
          (entry) => {

            if (
              String(entry.id) ===
              String(id)
            ) {

              return normalizeEntry({

                ...entry,

                ...updates,

                id,

                adjustmentDirection:
                  updates.adjustment_direction

              });

            }


            return entry;

          }
        );


    saveLocalEntries(
      nextEntries
    );


    entries =
      nextEntries;


    render();

    closeEditForm();


    alert(
      "Record updated locally."
    );

  }


  /* =========================================================
     CLOSE EDIT FORM
  ========================================================= */

  function closeEditForm() {

    const panel =
      $("editFormPanel");


    if (!panel) {
      return;
    }


    panel.classList.add(
      "hidden"
    );


    $("editForm")
      ?.reset();

  }


  /* =========================================================
     TABLE ACTIONS
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

          const id =
            editButton.dataset.id;

          openEditForm(id);

          return;

        }


        const deleteButton =
          target.closest(
            ".delete-entry-btn"
          );


        if (deleteButton) {

          const id =
            deleteButton.dataset.id;

          deleteEntry(id);

        }

      }
    );

  }


  /* =========================================================
     INITIALIZE APP
  ========================================================= */

  async function initializeApp() {

    /* DATE */

    if ($("date")) {

      $("date").value =
        today();

    }


    /* TYPE */

    if ($("type")) {

      $("type")
        .addEventListener(
          "change",
          updateFormFields
        );

      updateFormFields();

    }


    /* ADD FORM */

    if ($("ledgerForm")) {

      $("ledgerForm")
        .addEventListener(
          "submit",
          saveTransaction
        );

    }


    /* EDIT FORM */

    if ($("editForm")) {

      $("editForm")
        .addEventListener(
          "submit",
          updateEntry
        );

    }


    /* CANCEL EDIT */

    if ($("cancelEditBtn")) {

      $("cancelEditBtn")
        .addEventListener(
          "click",
          closeEditForm
        );

    }


    /* TABLE ACTIONS */

    setupTableActions();


    /* LOAD DATA */

    await loadEntries();


    /* -------------------------------------------------------
       AUTO REFRESH
       Every 10 seconds
    ------------------------------------------------------- */

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


})(); // IMPORTANT: CLOSE IIFE