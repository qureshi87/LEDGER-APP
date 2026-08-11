```javascript
/* =========================================================
   STOCK LEDGER
   Supabase + Local Fallback
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
      console.error("Supabase library not loaded.");
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
    return new Date().toISOString().split("T")[0];
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
      "entry-" +
      Date.now() +
      "-" +
      Math.random().toString(16).slice(2)
    );
  }


  /* =========================================================
     LOCAL STORAGE
  ========================================================= */

  function readLocalEntries() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];

      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("Local storage read failed:", error);
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
      console.warn("Local storage write failed:", error);
    }
  }


  /* =========================================================
     NORMALIZE ENTRY
  ========================================================= */

  function normalizeEntry(row) {
    row = row || {};

    return {
      id:
        row.id ||
        generateId(),

      product:
        String(row.product || "").trim(),

      type:
        row.type ||
        "adjustment",

      quantity:
        Number(row.quantity || 0),

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
     LOAD FROM SUPABASE
  ========================================================= */

  async function loadEntries() {
    const client = getSupabaseClient();

    if (client) {
      try {
        const result = await client
          .from("ledger_entries")
          .select("*")
          .order("date", {
            ascending: false
          })
          .order("created_at", {
            ascending: false
          });

        const data = result.data;
        const error = result.error;

        if (!error && Array.isArray(data)) {
          entries = data.map(normalizeEntry);

          saveLocalEntries(entries);

          render();

          console.log(
            "Supabase data loaded:",
            entries.length
          );

          return true;
        }

        console.error(
          "Supabase load failed:",
          error
        );

      } catch (error) {
        console.error(
          "Supabase connection failed:",
          error
        );
      }
    }

    /* LOCAL FALLBACK */

    entries = readLocalEntries()
      .map(normalizeEntry);

    render();

    return false;
  }


  /* =========================================================
     INVENTORY
  ========================================================= */

  function getInventory() {
    const inventory = {};

    entries.forEach(function (entry) {
      const product =
        String(entry.product || "").trim();

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

      const item = inventory[product];


      /* RECEIVED */

      if (entry.type === "received") {
        item.quantity += entry.quantity;

        item.totalCost +=
          entry.quantity *
          entry.unitPrice;

        item.costQuantity +=
          entry.quantity;
      }


      /* ISSUED */

      else if (entry.type === "issued") {
        item.quantity -= entry.quantity;
      }


      /* ADJUSTMENT */

      else if (entry.type === "adjustment") {

        if (
          entry.adjustmentDirection ===
          "increase"
        ) {
          item.quantity += entry.quantity;

          if (entry.unitPrice > 0) {
            item.totalCost +=
              entry.quantity *
              entry.unitPrice;

            item.costQuantity +=
              entry.quantity;
          }
        } else {
          item.quantity -= entry.quantity;
        }
      }
    });


    Object.values(inventory).forEach(function (item) {

      if (item.costQuantity > 0) {
        item.averageCost =
          item.totalCost /
          item.costQuantity;
      }

      item.stockValue =
        Math.max(0, item.quantity) *
        item.averageCost;
    });


    return inventory;
  }


  /* =========================================================
     DASHBOARD STATS
  ========================================================= */

  function renderStats() {
    const inventory = getInventory();

    let inventoryValue = 0;
    let itemsInStock = 0;

    Object.values(inventory).forEach(
      function (item) {
        inventoryValue += item.stockValue;

        itemsInStock += Math.max(
          0,
          item.quantity
        );
      }
    );


    const receivedValue =
      entries
        .filter(function (entry) {
          return entry.type === "received";
        })
        .reduce(function (total, entry) {
          return (
            total +
            entry.quantity *
            entry.unitPrice
          );
        }, 0);


    const issuedValue =
      entries
        .filter(function (entry) {
          return entry.type === "issued";
        })
        .reduce(function (total, entry) {
          return (
            total +
            entry.quantity *
            entry.unitPrice
          );
        }, 0);


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
    const body = $("stockTableBody");

    if (!body) {
      return;
    }

    const inventory = getInventory();

    const products =
      Object.entries(inventory)
        .filter(function (item) {
          return item[1].quantity > 0;
        });


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
        .map(function (item) {

          const product = item[0];
          const stock = item[1];

          return `
            <tr>

              <td>
                ${escapeHtml(product)}
              </td>

              <td>
                ${stock.quantity}
              </td>

              <td>
                ${money(stock.averageCost)}
              </td>

              <td>
                ${money(stock.stockValue)}
              </td>

            </tr>
          `;
        })
        .join("");
  }


  /* =========================================================
     RECEIVED TABLE
  ========================================================= */

  function renderReceivedTable() {
    const body = $("receivedTableBody");

    if (!body) {
      return;
    }

    const received =
      entries.filter(function (entry) {
        return entry.type === "received";
      });


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
        .map(function (entry) {

          return `
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
          `;
        })
        .join("");
  }


  /* =========================================================
     ISSUED TABLE
  ========================================================= */

  function renderIssuedTable() {
    const body = $("issuedTableBody");

    if (!body) {
      return;
    }

    const issued =
      entries.filter(function (entry) {
        return entry.type === "issued";
      });


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
        .map(function (entry) {

          return `
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
          `;
        })
        .join("");
  }


  /* =========================================================
     HISTORY TABLE
  ========================================================= */

  function renderHistoryTable() {
    const body = $("historyTableBody");

    if (!body) {
      return;
    }


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
        .map(function (entry) {

          return `
            <tr>

              <td>
                ${escapeHtml(entry.date)}
              </td>

              <td>
                ${escapeHtml(entry.product)}
              </td>

              <td>

                <span
                  class="badge ${escapeHtml(entry.type)}"
                >
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
          `;
        })
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
    const type = $("type");
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


    let labelText = "Reference";
    let placeholder =
      "e.g. Manual adjustment";


    if (type.value === "received") {
      labelText = "Vendor name";
      placeholder =
        "e.g. ABC Supplies";
    }


    if (type.value === "issued") {
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
     RESET MAIN FORM
  ========================================================= */

  function resetMainForm() {
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
  }


  /* =========================================================
     SAVE TRANSACTION
  ========================================================= */

  async function saveTransaction(event) {
    event.preventDefault();


    const product =
      $("product")?.value.trim() || "";

    const type =
      $("type")?.value || "received";

    const quantity =
      Number($("quantity")?.value || 0);

    const unitPrice =
      Number($("unitPrice")?.value || 0);

    const date =
      $("date")?.value || today();

    const counterparty =
      $("counterparty")?.value.trim() || "";

    const note =
      $("note")?.value.trim() || "";

    const adjustmentDirection =
      $("adjustmentDirection")?.value ||
      "increase";


    if (!product) {
      alert("Product name enter karein.");
      return;
    }


    if (!quantity || quantity <= 0) {
      alert("Valid quantity enter karein.");
      return;
    }


    /* =====================================================
       IMPORTANT:
       Only columns that actually exist in Supabase
       are sent here.
    ===================================================== */

    const row = {
      id: generateId(),

      product: product,

      type: type,

      quantity: quantity,

      unit_price: unitPrice,

      date: date,

      counterparty: counterparty,

      note: note,

      adjustment_direction:
        type === "adjustment"
          ? adjustmentDirection
          : "increase"
    };


    const client =
      getSupabaseClient();


    /* =====================================================
       SUPABASE SAVE
    ===================================================== */

    if (client) {

      try {

        console.log(
          "Saving transaction to Supabase:",
          row
        );


        const result =
          await client
            .from("ledger_entries")
            .insert([row])
            .select()
            .single();


        if (!result.error) {

          console.log(
            "Transaction saved to Supabase:",
            result.data
          );


          alert(
            "Transaction successfully save ho gayi."
          );


          resetMainForm();

          await loadEntries();

          return;
        }


        console.error(
          "Supabase INSERT error:",
          result.error
        );


        alert(
          "Supabase mein save nahi hua.\n\n" +
          "Error: " +
          result.error.message
        );


        return;

      } catch (error) {

        console.error(
          "Supabase INSERT exception:",
          error
        );


        alert(
          "Supabase connection error.\n\n" +
          error.message
        );


        return;
      }
    }


    /* =====================================================
       LOCAL FALLBACK
    ===================================================== */

    const localEntry =
      normalizeEntry(row);

    const nextEntries = [
      localEntry,
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
      "Supabase available nahi hai. " +
      "Transaction locally save hui."
    );


    resetMainForm();
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

        const result =
          await client
            .from("ledger_entries")
            .delete()
            .eq("id", id);


        if (!result.error) {

          alert(
            "Record successfully delete ho gaya."
          );

          await loadEntries();

          return;
        }


        console.error(
          "Supabase DELETE error:",
          result.error
        );


        alert(
          "Record delete nahi hua.\n\n" +
          result.error.message
        );


        return;

      } catch (error) {

        console.error(
          "Delete exception:",
          error
        );


        alert(
          "Supabase delete error.\n\n" +
          error.message
        );


        return;
      }
    }


    /* LOCAL DELETE */

    const nextEntries =
      readLocalEntries()
        .map(normalizeEntry)
        .filter(function (entry) {
          return String(entry.id) !==
            String(id);
        });


    saveLocalEntries(nextEntries);

    entries = nextEntries;

    render();
  }


  /* =========================================================
     OPEN EDIT FORM
  ========================================================= */

  function openEditForm(id) {

    const entry =
      entries.find(function (item) {
        return String(item.id) ===
          String(id);
      });


    if (!entry) {
      alert("Record nahi mila.");
      return;
    }


    const panel =
      $("editFormPanel");


    if (!panel) {
      alert(
        "Edit form page par available nahi hai."
      );

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


    if ($("editAdjustmentDirection")) {
      $("editAdjustmentDirection").value =
        entry.adjustmentDirection;
    }


    if ($("editMode")) {
      $("editMode").value =
        entry.type;
    }


    panel.classList.remove("hidden");


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
      alert("Record ID missing.");
      return;
    }


    const product =
      $("editProduct")?.value.trim() || "";

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
      alert("Product name enter karein.");
      return;
    }


    if (!quantity || quantity <= 0) {
      alert("Valid quantity enter karein.");
      return;
    }


    /* Only actual Supabase columns */

    const updates = {

      product: product,

      type: type,

      counterparty: counterparty,

      quantity: quantity,

      unit_price: unitPrice,

      date: date,

      note: note,

      adjustment_direction:
        type === "adjustment"
          ? adjustmentDirection
          : "increase"
    };


    const client =
      getSupabaseClient();


    if (client) {

      try {

        const result =
          await client
            .from("ledger_entries")
            .update(updates)
            .eq("id", id)
            .select()
            .single();


        if (!result.error) {

          alert(
            "Record successfully update ho gaya."
          );


          closeEditForm();

          await loadEntries();

          return;
        }


        console.error(
          "Supabase UPDATE error:",
          result.error
        );


        alert(
          "Record update nahi hua.\n\n" +
          result.error.message
        );


        return;

      } catch (error) {

        console.error(
          "Update exception:",
          error
        );


        alert(
          "Supabase update error.\n\n" +
          error.message
        );


        return;
      }
    }


    /* LOCAL UPDATE */

    const nextEntries =
      readLocalEntries()
        .map(normalizeEntry)
        .map(function (entry) {

          if (
            String(entry.id) ===
            String(id)
          ) {

            return normalizeEntry({
              ...entry,
              ...updates,
              id: id
            });
          }


          return entry;
        });


    saveLocalEntries(nextEntries);

    entries = nextEntries;

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


    panel.classList.add("hidden");


    if ($("editForm")) {
      $("editForm").reset();
    }
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
      function (event) {

        const target =
          event.target;


        if (
          !(target instanceof Element)
        ) {
          return;
        }


        const editButton =
          target.closest(".edit-btn");


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
      $("date").value = today();
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


    /* LOAD SUPABASE DATA */

    await loadEntries();


    /* =====================================================
       AUTO REFRESH
    ===================================================== */

    if (
      !window.__stockLedgerRefreshStarted
    ) {

      window.__stockLedgerRefreshStarted =
        true;


      window.__stockLedgerRefreshTimer =
        setInterval(
          function () {
            loadEntries();
          },
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
