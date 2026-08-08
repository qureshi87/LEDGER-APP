const STORAGE_KEY = 'stockLedgerEntries_v3';
const form = document.getElementById('dashboardForm');
const typeSelect = document.getElementById('movementType');
const counterpartyLabel = document.getElementById('counterpartyLabel');
const adjustmentWrap = document.getElementById('adjustmentWrap');
const stockTableBody = document.getElementById('stockTableBody');
const receivedSummaryBody = document.getElementById('receivedSummaryBody');
const issuedSummaryBody = document.getElementById('issuedSummaryBody');
const receivedTableBody = document.getElementById('receivedTableBody');
const issuedTableBody = document.getElementById('issuedTableBody');
const inventoryValueEl = document.getElementById('inventoryValue');
const itemsInStockEl = document.getElementById('itemsInStock');
const purchaseCostEl = document.getElementById('receivedValue');
const salesRevenueEl = document.getElementById('issuedValue');
const seedButton = document.getElementById('seedButton');

let entries = loadEntries();

function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

function loadEntries() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    const seedEntries = [
  {
    id: crypto.randomUUID(),
    product: '60X40X40',
    type: 'adjustment',
    quantity: 100,
    unitPrice: 0,
    date: '2026-08-08',
    counterparty: '',
    note: 'Opening stock',
    adjustmentDirection: 'increase'
  },
  {
    id: crypto.randomUUID(),
    product: 'Opening Stock',
    type: 'adjustment',
    quantity: 250,
    unitPrice: 0,
    date: '2026-08-08',
    counterparty: '',
    note: 'Opening stock',
    adjustmentDirection: 'increase'
  }
];

    localStorage.setItem(STORAGE_KEY, JSON.stringify(seedEntries));
    return seedEntries;
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to parse saved entries:', error);
    return [];
  }
}

function saveEntries() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'PKR',
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function getSignedQuantity(entry) {
  if (entry.type === 'received') {
    return Number(entry.quantity);
  }

  if (entry.type === 'issued') {
    return -Number(entry.quantity);
  }

  if (entry.adjustmentDirection === 'increase') {
    return Number(entry.quantity);
  }

  return -Number(entry.quantity);
}

function getInventoryMap() {
  const inventory = {};

  entries.forEach((entry) => {
    const product = String(entry.product || '').trim();
    if (!product) {
      return;
    }

    if (!inventory[product]) {
      inventory[product] = {
        quantity: 0,
        purchaseCost: 0,
        purchaseQty: 0,
        averageCost: 0,
        value: 0
      };
    }

    const delta = getSignedQuantity(entry);
    inventory[product].quantity += delta;

    if (entry.type === 'received') {
      inventory[product].purchaseCost += Number(entry.quantity) * Number(entry.unitPrice || 0);
      inventory[product].purchaseQty += Number(entry.quantity);
    }

    if (entry.type === 'adjustment' && entry.adjustmentDirection === 'increase') {
      inventory[product].purchaseCost += Number(entry.quantity) * Number(entry.unitPrice || 0);
      inventory[product].purchaseQty += Number(entry.quantity);
    }
  });

  Object.keys(inventory).forEach((product) => {
    const item = inventory[product];
    item.averageCost = item.purchaseQty > 0 ? item.purchaseCost / item.purchaseQty : 0;
    item.value = item.quantity > 0 ? item.quantity * item.averageCost : 0;
  });

  return inventory;
}

function getSummaryStats() {
  const inventory = getInventoryMap();
  const inventoryValue = Object.values(inventory).reduce((sum, item) => sum + item.value, 0);
  const itemsInStock = Object.values(inventory).reduce((sum, item) => sum + Math.max(0, item.quantity), 0);
  const receivedValue = entries
    .filter((entry) => entry.type === 'received')
    .reduce((sum, entry) => sum + Number(entry.quantity) * Number(entry.unitPrice || 0), 0);

  const issuedValue = entries
    .filter((entry) => entry.type === 'issued')
    .reduce((sum, entry) => sum + Number(entry.quantity) * Number(entry.unitPrice || 0), 0);

  return { inventoryValue, itemsInStock, receivedValue, issuedValue, inventory };
}

function renderStats() {
  const summary = getSummaryStats();

  if (inventoryValueEl) inventoryValueEl.textContent = formatCurrency(summary.inventoryValue);
  if (itemsInStockEl) itemsInStockEl.textContent = String(summary.itemsInStock);
  if (purchaseCostEl) purchaseCostEl.textContent = formatCurrency(summary.receivedValue);
  if (salesRevenueEl) salesRevenueEl.textContent = formatCurrency(summary.issuedValue);
}

function renderStockTable() {
  if (!stockTableBody) return;

  const { inventory } = getSummaryStats();
  const rows = Object.entries(inventory)
    .filter(([, item]) => item.quantity > 0)
    .sort((a, b) => b[1].quantity - a[1].quantity);

  if (!rows.length) {
    stockTableBody.innerHTML = '<tr><td colspan="4" class="empty-row">No stock available</td></tr>';
    return;
  }

  stockTableBody.innerHTML = rows
    .map(([product, item]) => {
      return `
        <tr>
          <td>${escapeHtml(product)}</td>
          <td>${item.quantity}</td>
          <td>${formatCurrency(item.averageCost)}</td>
          <td>${formatCurrency(item.value)}</td>
        </tr>
      `;
    })
    .join('');
}

function renderReceivedSummary() {
  if (!receivedSummaryBody) return;

  const summary = {};
  entries
    .filter((entry) => entry.type === 'received')
    .forEach((entry) => {
      const key = entry.product;
      summary[key] = (summary[key] || 0) + Number(entry.quantity || 0);
    });

  const rows = Object.entries(summary);
  if (!rows.length) {
    receivedSummaryBody.innerHTML = '<tr><td colspan="2" class="empty-row">No received stock</td></tr>';
    return;
  }

  receivedSummaryBody.innerHTML = rows
    .map(([product, qty]) => `
      <tr>
        <td>${escapeHtml(product)}</td>
        <td>${qty}</td>
      </tr>
    `)
    .join('');
}

function renderIssuedSummary() {
  if (!issuedSummaryBody) return;

  const summary = {};
  entries
    .filter((entry) => entry.type === 'issued')
    .forEach((entry) => {
      const key = entry.product;
      summary[key] = (summary[key] || 0) + Number(entry.quantity || 0);
    });

  const rows = Object.entries(summary);
  if (!rows.length) {
    issuedSummaryBody.innerHTML = '<tr><td colspan="2" class="empty-row">No issued stock</td></tr>';
    return;
  }

  issuedSummaryBody.innerHTML = rows
    .map(([product, qty]) => `
      <tr>
        <td>${escapeHtml(product)}</td>
        <td>${qty}</td>
      </tr>
    `)
    .join('');
}

function renderReceivedTable() {
  if (!receivedTableBody) return;

  const receivedEntries = entries
    .filter((entry) => entry.type === 'received')
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!receivedEntries.length) {
    receivedTableBody.innerHTML = '<tr><td colspan="7" class="empty-row">No stock received yet</td></tr>';
    return;
  }

  receivedTableBody.innerHTML = receivedEntries
    .map((entry) => `
      <tr>
        <td>${entry.date}</td>
        <td>${escapeHtml(entry.product)}</td>
        <td>+${entry.quantity}</td>
        <td>${formatCurrency(entry.unitPrice)}</td>
        <td>${escapeHtml(entry.counterparty || 'â€”')}</td>
        <td>${escapeHtml(entry.note || 'â€”')}</td>
        <td>
          <div class="action-group">
            <button class="secondary small-btn edit-btn" data-id="${entry.id}" type="button">Edit</button>
            <button class="delete-btn" data-id="${entry.id}" type="button">Delete</button>
          </div>
        </td>
      </tr>
    `)
    .join('');

  receivedTableBody.querySelectorAll('.delete-btn').forEach((button) => {
    button.addEventListener('click', () => {
      deleteEntry(button.getAttribute('data-id'));
    });
  });

  receivedTableBody.querySelectorAll('.edit-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const target = entries.find((entry) => entry.id === button.getAttribute('data-id'));
      if (target) openEditForm(target, 'received');
    });
  });
}

function renderIssuedTable() {
  if (!issuedTableBody) return;

  const issuedEntries = entries
    .filter((entry) => entry.type === 'issued')
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!issuedEntries.length) {
    issuedTableBody.innerHTML = '<tr><td colspan="7" class="empty-row">No stock issued yet</td></tr>';
    return;
  }

  issuedTableBody.innerHTML = issuedEntries
    .map((entry) => `
      <tr>
        <td>${entry.date}</td>
        <td>${escapeHtml(entry.product)}</td>
        <td>-${entry.quantity}</td>
        <td>${formatCurrency(entry.unitPrice)}</td>
        <td>${escapeHtml(entry.counterparty || 'â€”')}</td>
        <td>${escapeHtml(entry.note || 'â€”')}</td>
        <td>
          <div class="action-group">
            <button class="secondary small-btn edit-btn" data-id="${entry.id}" type="button">Edit</button>
            <button class="delete-btn" data-id="${entry.id}" type="button">Delete</button>
          </div>
        </td>
      </tr>
    `)
    .join('');

  issuedTableBody.querySelectorAll('.delete-btn').forEach((button) => {
    button.addEventListener('click', () => {
      deleteEntry(button.getAttribute('data-id'));
    });
  });

  issuedTableBody.querySelectorAll('.edit-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const target = entries.find((entry) => entry.id === button.getAttribute('data-id'));
      if (target) openEditForm(target, 'issued');
    });
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toggleFields() {
  const showAdjustment = typeSelect.value === 'adjustment';
  adjustmentWrap.classList.toggle('hidden', !showAdjustment);

  const currentValue = document.getElementById('counterparty')?.value || '';

  if (typeSelect.value === 'issued') {
    counterpartyLabel.innerHTML = 'Person name <input id="counterparty" name="counterparty" type="text" placeholder="e.g. Rajesh" />';
  } else if (typeSelect.value === 'received') {
    counterpartyLabel.innerHTML = 'Vendor name <input id="counterparty" name="counterparty" type="text" placeholder="e.g. ABC Supplies" />';
  } else {
    counterpartyLabel.innerHTML = 'Reference <input id="counterparty" name="counterparty" type="text" placeholder="e.g. Manual check" />';
  }

  const field = document.getElementById('counterparty');
  if (field) {
    field.value = currentValue;
  }
}

function deleteEntry(id) {
  entries = entries.filter((entry) => entry.id !== id);
  saveEntries();
  render();
}

function handleSubmit(event) {
  event.preventDefault();

  const product = document.getElementById('product').value.trim();
  const type = typeSelect.value;
  const quantity = Number(document.getElementById('quantity').value);
  const unitPrice = Number(document.getElementById('unitPrice').value || 0);
  const date = document.getElementById('date').value || getTodayString();
  const note = document.getElementById('note').value.trim();
  const counterparty = document.getElementById('counterparty').value.trim();
  const adjustmentDirection = document.getElementById('adjustmentDirection').value;

  if (!product || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
    return;
  }

  entries.push({
    id: crypto.randomUUID(),
    product,
    type,
    quantity,
    unitPrice,
    date,
    counterparty,
    note,
    adjustmentDirection: type === 'adjustment' ? adjustmentDirection : 'increase'
  });

  saveEntries();
  form.reset();
  document.getElementById('quantity').value = '1';
  document.getElementById('unitPrice').value = '0';
  document.getElementById('date').value = getTodayString();
  toggleFields();
  render();
}

function renderHistoryTable() {
  const tableBody = document.getElementById('historyTableBody');
  if (!tableBody) return;

  const sortedEntries = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!sortedEntries.length) {
    tableBody.innerHTML = '<tr><td colspan="7" class="empty-row">No history yet</td></tr>';
    return;
  }

  tableBody.innerHTML = sortedEntries
    .map((entry) => `
      <tr>
        <td>${entry.date}</td>
        <td>${escapeHtml(entry.product)}</td>
        <td>${escapeHtml(entry.type)}</td>
        <td>${entry.type === 'issued' ? '-' : '+'}${entry.quantity}</td>
        <td>${formatCurrency(entry.unitPrice)}</td>
        <td>${escapeHtml(entry.counterparty || 'â€”')}</td>
        <td>${escapeHtml(entry.note || 'â€”')}</td>
      </tr>
    `)
    .join('');
}

function openEditForm(entry, mode) {
  const panel = document.getElementById('editFormPanel');
  const formEl = document.getElementById('editForm');
  const entryId = document.getElementById('editEntryId');
  const editMode = document.getElementById('editMode');
  const adjustmentDirectionField = document.getElementById('editAdjustmentDirection');

  if (!panel || !formEl || !entryId || !editMode) return;

  entryId.value = entry.id;
  editMode.value = mode;
  document.getElementById('editProduct').value = entry.product || '';
  document.getElementById('editType').value = entry.type || mode;
  document.getElementById('editQuantity').value = entry.quantity || 1;
  document.getElementById('editUnitPrice').value = entry.unitPrice || 0;
  document.getElementById('editDate').value = entry.date || getTodayString();
  document.getElementById('editCounterparty').value = entry.counterparty || '';
  document.getElementById('editNote').value = entry.note || '';
  if (adjustmentDirectionField) {
    adjustmentDirectionField.value = entry.adjustmentDirection || 'increase';
  }

  panel.classList.remove('hidden');
  formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleEditSubmit(event) {
  event.preventDefault();

  const entryId = document.getElementById('editEntryId').value;
  const product = document.getElementById('editProduct').value.trim();
  const type = document.getElementById('editType').value;
  const quantity = Number(document.getElementById('editQuantity').value);
  const unitPrice = Number(document.getElementById('editUnitPrice').value || 0);
  const date = document.getElementById('editDate').value || getTodayString();
  const counterparty = document.getElementById('editCounterparty').value.trim();
  const note = document.getElementById('editNote').value.trim();
  const adjustmentDirectionField = document.getElementById('editAdjustmentDirection');
  const adjustmentDirection = adjustmentDirectionField ? adjustmentDirectionField.value : 'increase';

  if (!product || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
    return;
  }

  const current = entries.find((entry) => entry.id === entryId);
  if (!current) return;

  current.product = product;
  current.type = type;
  current.quantity = quantity;
  current.unitPrice = unitPrice;
  current.date = date;
  current.counterparty = counterparty;
  current.note = note;
  current.adjustmentDirection = type === 'adjustment' ? adjustmentDirection : 'increase';

  saveEntries();
  render();
  const panel = document.getElementById('editFormPanel');
  if (panel) panel.classList.add('hidden');
}

function bindEditForm() {
  const editForm = document.getElementById('editForm');
  if (!editForm) return;

  editForm.addEventListener('submit', handleEditSubmit);
  document.getElementById('cancelEditBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('editFormPanel');
    if (panel) panel.classList.add('hidden');
  });
}

function render() {
  renderStats();
  renderStockTable();
  renderReceivedSummary();
  renderIssuedSummary();

  if (document.body.dataset.page === 'received') renderReceivedTable();
  if (document.body.dataset.page === 'issued') renderIssuedTable();
  if (document.body.dataset.page === 'history') renderHistoryTable();
}

if (seedButton) {
  seedButton.addEventListener('click', () => {
    entries = loadEntries();
    saveEntries();
    render();
  });
}

if (typeSelect) {
  typeSelect.addEventListener('change', toggleFields);
}

if (form) {
  form.addEventListener('submit', handleSubmit);
}

const dateInput = document.getElementById('date');
if (dateInput) dateInput.value = getTodayString();
if (typeSelect) toggleFields();
bindEditForm();
render();

