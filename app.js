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
     STORAGE
  ======================================================= */

  const STORAGE_KEY = "stockLedgerEntries_v4";


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

  function handleFormSubmit(event) {

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


    /* -------------------------------------------------------
       CREATE TRANSACTION
    ------------------------------------------------------- */

    const entries =
      getEntries();


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


    entries.push(entry);


    saveEntries(entries);


    /* -------------------------------------------------------
       RESET
    ------------------------------------------------------- */

    const form =
      $("ledgerForm");

    if (form) {
      form.reset();
    }


    setDefaultDate();

    updateTransactionUI();

    renderCurrentPage();


    alert(
      "Transaction saved successfully."
    );

  }


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

  function init() {

    setDefaultDate();

    updateTransactionUI();

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

  }


  /* =======================================================
     START
  ======================================================= */

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      init
    );

  } else {

    init();

  }

})();