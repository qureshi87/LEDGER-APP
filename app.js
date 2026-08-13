"use strict";

(function () {
  if (window.__stockLedgerAppLoaded) return;
  window.__stockLedgerAppLoaded = true;

  const SUPABASE_URL = "https://uizwbjtthrypsxtosfnc.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_nHin134kT1kqB8Q42NWAVw_c2EYkJWU";
  const STORAGE_KEY = "stockLedgerEntries_v5";
  const SETTINGS_KEY = "stockLedgerMinimumLevels_v1";
  const REMINDER_KEY = "stockLedgerReminders_v1";

  let supabaseClient = null;
  let ledgerEntries = [];
  let minimumLevels = {};
  let realtimeChannel = null;
  let settingsChannel = null;
  let stockSearch = "";
  let pageSearch = "";
  let notifications = [];

  const $ = (id) => document.getElementById(id);

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;").replaceAll("<","&lt;")
      .replaceAll(">","&gt;").replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function num(value) { return Number(value || 0); }

  function formatNumber(value) {
    return num(value).toLocaleString("en-PK");
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }

  function setSync(text, good=false) {
    const el = $("syncStatus");
    if (!el) return;
    el.textContent = text;
    el.className = "sync-badge " + (good ? "good" : "");
  }

  async function ensureSupabase() {
    if (supabaseClient) return supabaseClient;
    if (!window.supabase?.createClient) {
      throw new Error("Supabase library is not available.");
    }
    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    );
    return supabaseClient;
  }

  function localSave() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ledgerEntries));
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(minimumLevels));
    } catch (e) {}
  }

  function localLoad() {
    try {
      ledgerEntries = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      minimumLevels = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (!Array.isArray(ledgerEntries)) ledgerEntries = [];
      if (!minimumLevels || typeof minimumLevels !== "object") minimumLevels = {};
    } catch {
      ledgerEntries = [];
      minimumLevels = {};
    }
  }

  function normalize(row) {
    return {
      id: row.id,
      product: row.product || "",
      type: row.type || "adjustment",
      counterparty: row.counterparty || "",
      adjustmentDirection: row.adjustment_direction || row.adjustmentDirection || "increase",
      quantity: num(row.quantity),
      date: row.date || "",
      note: row.note || "",
      createdAt: row.created_at || row.createdAt || ""
    };
  }

  function dbEntry(entry) {
    return {
      id: entry.id,
      product: String(entry.product || "").trim(),
      type: entry.type,
      counterparty: String(entry.counterparty || ""),
      adjustment_direction: entry.type === "adjustment" ? (entry.adjustmentDirection || "increase") : null,
      quantity: num(entry.quantity),
      unit_price: 0,
      date: entry.date,
      note: String(entry.note || "")
    };
  }

  async function refreshEntries() {
    const client = await ensureSupabase();
    const { data, error } = await client
      .from("ledger_entries")
      .select("*")
      .order("date", { ascending:false })
      .order("created_at", { ascending:false });
    if (error) throw error;
    ledgerEntries = (data || []).map(normalize);
    localSave();
    renderAll();
  }

  
  async function refreshNotifications() {
    const client = await ensureSupabase();
    const {data,error}=await client.from("ledger_notifications").select("*").eq("is_active",true).order("created_at",{ascending:false});
    if(error) throw error;
    notifications=(data||[]).filter(n=>!n.show_until || n.show_until>=today());
    renderNotifications();
  }
  async function saveNotification(x,id=null){
    const client=await ensureSupabase();
    const row={message:x.message,priority:x.priority,show_until:x.show_until||null,updated_at:new Date().toISOString()};
    const r=id ? await client.from("ledger_notifications").update(row).eq("id",id) :
                 await client.from("ledger_notifications").insert([{...row,is_active:true}]);
    if(r.error) throw r.error; await refreshNotifications();
  }
  async function deleteNotification(id){
    const client=await ensureSupabase(); const {error}=await client.from("ledger_notifications").delete().eq("id",id);
    if(error) throw error; await refreshNotifications();
  }
  function np(p){return p==="important"?{i:"🔴",l:"IMPORTANT",c:"important"}:p==="warning"?{i:"🟡",l:"WARNING",c:"warning"}:{i:"🔵",l:"NOTE",c:"general"}}
  function renderNotifications(){
    const active=notifications.filter(n=>!n.show_until||n.show_until>=today());
    const count=$("notificationCount"), list=$("notificationsList"), marquee=$("marqueeContent");
    if(count){count.textContent=active.length+" active";count.className="status-pill "+(active.length?"warning":"neutral")}
    if(marquee){
      marquee.textContent=active.length?active.map(n=>{const p=np(n.priority);return `${p.i} ${p.l}: ${n.message}`}).join("   •   "):"No active notifications or notes.";
      marquee.classList.toggle("marquee-scroll",!!active.length);
    }
    if(list) list.innerHTML=active.length?active.map(n=>{const p=np(n.priority);return `<div class="notification-card ${p.c}"><div class="notification-icon">${p.i}</div><div class="notification-body"><div class="notification-meta">${p.l} · ${n.show_until?"Until "+esc(n.show_until):"Always visible"}</div><strong>${esc(n.message)}</strong></div><div class="notification-actions"><button class="secondary small-btn" data-ne="${n.id}">Edit</button><button class="delete-btn" data-nd="${n.id}">Delete</button></div></div>`}).join(""):'<div class="alert-empty">No active notifications or notes.</div>';
    list?.querySelectorAll("[data-nd]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this notification?"))try{await deleteNotification(b.dataset.nd)}catch(e){alert(e.message)}});
    list?.querySelectorAll("[data-ne]").forEach(b=>b.onclick=()=>{const n=active.find(x=>String(x.id)===String(b.dataset.ne));if(!n)return;$("notificationEditId").value=n.id;$("notificationEditText").value=n.message;$("notificationEditPriority").value=n.priority;$("notificationEditDate").value=n.show_until||"";$("notificationEditPanel").classList.remove("hidden");$("notificationEditPanel").scrollIntoView({behavior:"smooth"})});
  }
  function setupNotifications(){
    $("notificationForm")?.addEventListener("submit",async e=>{e.preventDefault();try{await saveNotification({message:$("notificationText").value.trim(),priority:$("notificationPriority").value,show_until:$("notificationDate").value||null});e.target.reset();alert("Notification added.")}catch(x){alert("Could not save notification.\n\n"+x.message)}});
    $("notificationEditForm")?.addEventListener("submit",async e=>{e.preventDefault();try{await saveNotification({message:$("notificationEditText").value.trim(),priority:$("notificationEditPriority").value,show_until:$("notificationEditDate").value||null},$("notificationEditId").value);$("notificationEditPanel").classList.add("hidden")}catch(x){alert("Could not update notification.\n\n"+x.message)}});
    $("cancelNotificationEdit")?.addEventListener("click",()=>$("notificationEditPanel")?.classList.add("hidden"));
  }

  async function refreshMinimumLevels() {
    const client = await ensureSupabase();
    const { data, error } = await client
      .from("product_stock_settings")
      .select("product, minimum_stock");
    if (error) {
      console.warn("Minimum stock settings unavailable:", error.message);
      return;
    }
    minimumLevels = {};
    (data || []).forEach(row => minimumLevels[row.product] = num(row.minimum_stock));
    localSave();
    renderAll();
  }

  function subscribeRealtime() {
    if (!supabaseClient) return;

    if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);
    if (settingsChannel) supabaseClient.removeChannel(settingsChannel);
    if (window.__notificationChannel) supabaseClient.removeChannel(window.__notificationChannel);
    window.__notificationChannel=supabaseClient.channel("ledger_notifications_realtime_v1")
      .on("postgres_changes",{event:"*",schema:"public",table:"ledger_notifications"},async()=>{try{await refreshNotifications()}catch(e){console.error(e)}}).subscribe();


    realtimeChannel = supabaseClient
      .channel("ledger_entries_realtime_v5")
      .on("postgres_changes",
        { event:"*", schema:"public", table:"ledger_entries" },
        async () => {
          try { await refreshEntries(); } catch(e) { console.error(e); }
        })
      .subscribe();

    settingsChannel = supabaseClient
      .channel("stock_settings_realtime_v1")
      .on("postgres_changes",
        { event:"*", schema:"public", table:"product_stock_settings" },
        async () => {
          try { await refreshMinimumLevels(); } catch(e) { console.error(e); }
        })
      .subscribe();
  }

  function signed(entry) {
    if (entry.type === "received") return num(entry.quantity);
    if (entry.type === "issued") return -num(entry.quantity);
    return entry.adjustmentDirection === "increase" ? num(entry.quantity) : -num(entry.quantity);
  }

  function calculateStock() {
    const map = {};
    ledgerEntries.forEach(entry => {
      const product = String(entry.product || "").trim();
      if (!product) return;
      if (!map[product]) map[product] = { received:0, issued:0, quantity:0 };
      if (entry.type === "received") map[product].received += num(entry.quantity);
      if (entry.type === "issued") map[product].issued += num(entry.quantity);
      map[product].quantity += signed(entry);
    });
    return map;
  }

  function statusFor(qty, min) {
    if (!min) return { cls:"neutral", text:"Not Set", icon:"⚪" };
    if (qty <= min) return { cls:"danger", text:"LOW", icon:"🔴" };
    if (qty <= min * 1.5) return { cls:"warning", text:"WARNING", icon:"🟡" };
    return { cls:"success", text:"GOOD", icon:"🟢" };
  }

  function renderStats() {
    const totalReceived = ledgerEntries.filter(e=>e.type==="received").reduce((s,e)=>s+num(e.quantity),0);
    const totalIssued = ledgerEntries.filter(e=>e.type==="issued").reduce((s,e)=>s+num(e.quantity),0);
    const stock = calculateStock();
    const items = Object.values(stock).reduce((s,x)=>s+Math.max(0,x.quantity),0);
    const low = Object.entries(stock).filter(([p,x]) => {
      const min = num(minimumLevels[p]);
      return min > 0 && Math.max(0,x.quantity) <= min;
    }).length;

    if ($("totalReceived")) $("totalReceived").textContent = formatNumber(totalReceived);
    if ($("totalIssued")) $("totalIssued").textContent = formatNumber(totalIssued);
    if ($("itemsInStock")) $("itemsInStock").textContent = formatNumber(items);
    if ($("lowStockCount")) $("lowStockCount").textContent = formatNumber(low);
  }

  function renderStockTable() {
    const tbody = $("stockTableBody");
    if (!tbody) return;

    const stock = calculateStock();
    const products = Object.keys(stock)
      .filter(p => !stockSearch || p.toLowerCase().includes(stockSearch.toLowerCase()))
      .sort();

    if (!products.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-row">No matching product found.</td></tr>`;
      return;
    }

    tbody.innerHTML = products.map(product => {
      const item = stock[product];
      const qty = Math.max(0,item.quantity);
      const min = num(minimumLevels[product]);
      const status = statusFor(qty,min);

      return `<tr>
        <td><strong>${esc(product)}</strong></td>
        <td>+${formatNumber(item.received)}</td>
        <td>-${formatNumber(item.issued)}</td>
        <td><strong>${formatNumber(qty)}</strong></td>
        <td>${min ? formatNumber(min) : "—"}</td>
        <td><span class="status-pill ${status.cls}">${status.icon} ${status.text}</span></td>
        <td>
          <div class="level-editor">
            <input type="number" min="0" step="1" value="${min}" data-level-input="${esc(product)}">
            <button type="button" class="save-level" data-save-level="${esc(product)}">Save</button>
          </div>
        </td>
      </tr>`;
    }).join("");

    tbody.querySelectorAll("[data-save-level]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const product = btn.dataset.saveLevel;
        const input = tbody.querySelector(`[data-level-input="${CSS.escape(product)}"]`);
        await saveMinimumLevel(product, input?.value);
      });
    });
  }

  async function saveMinimumLevel(product, value) {
    const minimum = Math.max(0, Math.floor(num(value)));
    try {
      const client = await ensureSupabase();
      const { error } = await client.from("product_stock_settings").upsert(
        { product, minimum_stock: minimum, updated_at: new Date().toISOString() },
        { onConflict:"product" }
      );
      if (error) throw error;
      minimumLevels[product] = minimum;
      localSave();
      renderAll();
    } catch (e) {
      alert("Could not save minimum stock level.\n\n" + e.message);
    }
  }

  function renderAlerts() {
    const box = $("stockAlerts");
    const status = $("stockAlertStatus");
    if (!box || !status) return;

    const stock = calculateStock();
    const alerts = Object.entries(stock)
      .map(([product,item]) => ({product, qty:Math.max(0,item.quantity), min:num(minimumLevels[product])}))
      .filter(x => x.min > 0 && x.qty <= x.min)
      .sort((a,b)=>a.qty-b.qty);

    if (!alerts.length) {
      status.textContent = "✓ All stock levels normal";
      status.className = "status-pill success";
      box.innerHTML = `<div class="alert-empty">✓ No low-stock items right now.</div>`;
      return;
    }

    status.textContent = `${alerts.length} alert${alerts.length===1?"":"s"}`;
    status.className = "status-pill danger";
    box.innerHTML = alerts.map(x => `
      <div class="stock-alert ${x.qty <= Math.max(1,Math.floor(x.min*.4)) ? "critical" : ""}">
        <div><strong>${esc(x.product)}</strong><small>Minimum: ${formatNumber(x.min)} pieces</small></div>
        <strong>${formatNumber(x.qty)} left</strong>
      </div>`).join("");
  }

  function renderReceivedPage() {
    const tbody = $("receivedTableBody");
    if (!tbody) return;
    const rows = ledgerEntries.filter(e=>e.type==="received")
      .filter(e=>matchesPageSearch(e))
      .sort((a,b)=>new Date(b.date)-new Date(a.date));

    tbody.innerHTML = rows.length ? rows.map(e => `<tr>
      <td>${esc(e.date)}</td><td><strong>${esc(e.product)}</strong></td>
      <td>${esc(e.counterparty || "—")}</td><td>+${formatNumber(e.quantity)}</td>
      <td>${esc(e.note || "—")}</td>
      <td><div class="action-group"><button class="edit-btn secondary small-btn" data-edit="${e.id}">Edit</button><button class="delete-btn" data-delete="${e.id}">Delete</button></div></td>
    </tr>`).join("") : `<tr><td colspan="6" class="empty-row">No received stock found.</td></tr>`;

    bindRowActions();
  }

  function renderIssuedPage() {
    const tbody = $("issuedTableBody");
    if (!tbody) return;
    const rows = ledgerEntries.filter(e=>e.type==="issued")
      .filter(e=>matchesPageSearch(e))
      .sort((a,b)=>new Date(b.date)-new Date(a.date));

    tbody.innerHTML = rows.length ? rows.map(e => `<tr>
      <td>${esc(e.date)}</td><td><strong>${esc(e.product)}</strong></td>
      <td>${esc(e.counterparty || "—")}</td><td>-${formatNumber(e.quantity)}</td>
      <td>${esc(e.note || "—")}</td>
      <td><div class="action-group"><button class="edit-btn secondary small-btn" data-edit="${e.id}">Edit</button><button class="delete-btn" data-delete="${e.id}">Delete</button></div></td>
    </tr>`).join("") : `<tr><td colspan="6" class="empty-row">No issued stock found.</td></tr>`;

    bindRowActions();
  }

  function renderHistoryPage() {
    const tbody = $("historyTableBody");
    if (!tbody) return;
    const rows = [...ledgerEntries].filter(matchesPageSearch).sort((a,b)=>new Date(b.date)-new Date(a.date));

    tbody.innerHTML = rows.length ? rows.map(e => {
      const type = e.type==="adjustment" ? `Adjustment · ${e.adjustmentDirection}` : e.type;
      const sign = e.type==="issued" ? "-" : "+";
      return `<tr>
        <td>${esc(e.date)}</td><td><strong>${esc(e.product)}</strong></td>
        <td><span class="type-pill ${e.type}">${esc(type)}</span></td>
        <td>${esc(e.counterparty || "—")}</td><td>${sign}${formatNumber(e.quantity)}</td>
        <td>${esc(e.note || "—")}</td>
        <td><div class="action-group"><button class="edit-btn secondary small-btn" data-edit="${e.id}">Edit</button><button class="delete-btn" data-delete="${e.id}">Delete</button></div></td>
      </tr>`;
    }).join("") : `<tr><td colspan="7" class="empty-row">No transactions found.</td></tr>`;

    bindRowActions();
  }

  function matchesPageSearch(e) {
    if (!pageSearch) return true;
    const q = pageSearch.toLowerCase();
    return [e.product,e.counterparty,e.note,e.type,e.date].some(v => String(v||"").toLowerCase().includes(q));
  }

  function bindRowActions() {
    document.querySelectorAll("[data-delete]").forEach(btn => btn.addEventListener("click", async () => {
      if (!confirm("Delete this transaction permanently?")) return;
      try {
        const client = await ensureSupabase();
        const { error } = await client.from("ledger_entries").delete().eq("id", btn.dataset.delete);
        if (error) throw error;
        await refreshEntries();
      } catch(e) { alert("Could not delete transaction.\n\n"+e.message); }
    }));

    document.querySelectorAll("[data-edit]").forEach(btn => btn.addEventListener("click", () => {
      const entry = ledgerEntries.find(e=>String(e.id)===String(btn.dataset.edit));
      if (entry) openEdit(entry);
    }));
  }

  function openEdit(entry) {
    const panel = $("editFormPanel");
    if (!panel) return;
    $("editEntryId").value = entry.id;
    $("editMode").value = entry.type;
    $("editProduct").value = entry.product;
    $("editQuantity").value = entry.quantity;
    $("editDate").value = entry.date;
    $("editCounterparty").value = entry.counterparty || "";
    $("editNote").value = entry.note || "";
    if ($("editType")) $("editType").value = entry.type;
    if ($("editAdjustmentDirection")) $("editAdjustmentDirection").value = entry.adjustmentDirection || "increase";
    panel.classList.remove("hidden");
    panel.scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function handleEdit(event) {
    event.preventDefault();
    const id = $("editEntryId")?.value;
    const updated = {
      id,
      product: $("editProduct").value.trim(),
      type: $("editType")?.value || $("editMode").value,
      quantity: num($("editQuantity").value),
      date: $("editDate").value,
      counterparty: $("editCounterparty").value.trim(),
      note: $("editNote").value.trim(),
      adjustmentDirection: $("editAdjustmentDirection")?.value || "increase"
    };

    if (!updated.product || updated.quantity <= 0 || !updated.date) {
      alert("Please enter product, quantity and date.");
      return;
    }

    try {
      const client = await ensureSupabase();
      const { error } = await client.from("ledger_entries").update(dbEntry(updated)).eq("id", id);
      if (error) throw error;
      $("editFormPanel").classList.add("hidden");
      await refreshEntries();
    } catch(e) {
      alert("Could not update transaction.\n\n"+e.message);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const product = $("product").value.trim();
    const type = $("type").value;
    const quantity = num($("quantity").value);
    const date = $("date").value;
    const counterparty = $("counterparty").value.trim();
    const note = $("note").value.trim();
    const adjustmentDirection = $("adjustmentDirection")?.value || "increase";

    if (!product || quantity <= 0 || !date) {
      alert("Please enter product, quantity and date.");
      return;
    }

    const entry = {
      id: crypto.randomUUID(),
      product, type, quantity, date, counterparty, note,
      adjustmentDirection: type==="adjustment" ? adjustmentDirection : null
    };

    try {
      const client = await ensureSupabase();
      const { data, error } = await client.from("ledger_entries")
        .insert([dbEntry(entry)]).select().single();
      if (error) throw error;

      ledgerEntries.push(normalize(data || dbEntry(entry)));
      localSave();
      renderAll();

      $("ledgerForm").reset();
      $("quantity").value = "1";
      $("date").value = today();
      updateTransactionUI();
    } catch(e) {
      alert("Could not save transaction.\n\n"+e.message);
    }
  }

  function updateTransactionUI() {
    const type = $("type")?.value;
    const label = $("counterpartyLabel");
    const field = $("counterparty");
    const adjust = $("adjustmentWrap");
    if (!label || !field || !adjust) return;

    if (type==="adjustment") {
      label.classList.add("hidden");
      adjust.classList.remove("hidden");
      field.value = "";
    } else {
      label.classList.remove("hidden");
      adjust.classList.add("hidden");
      field.placeholder = type==="received" ? "e.g. ABC Supplies" : "e.g. Customer / Worker";
    }
  }

  function downloadBlob(name, content, type) {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function backupPayload() {
    return {
      backupVersion: 2,
      app: "LEDGER-APP",
      backupCreatedAt: new Date().toISOString(),
      dataSource: "Supabase",
      transactions: ledgerEntries.map(e => ({
        id:e.id, product:e.product, type:e.type, quantity:e.quantity,
        date:e.date, counterparty:e.counterparty || "",
        note:e.note || "", adjustmentDirection:e.adjustmentDirection || null
      })),
      minimumStockLevels: minimumLevels
    };
  }

  function downloadBackup() {
    downloadBlob(
      `stock-ledger-backup-${today()}.json`,
      JSON.stringify(backupPayload(), null, 2),
      "application/json"
    );
  }

  function csvCell(v) {
    return `"${String(v ?? "").replaceAll('"','""')}"`;
  }

  function downloadCsv() {
    const stock = calculateStock();
    const lines = [
      ["Date","Product","Type","Person / Vendor","Quantity","Current Stock","Minimum Stock","Status","Notes"]
        .map(csvCell).join(",")
    ];

    [...ledgerEntries].sort((a,b)=>new Date(a.date)-new Date(b.date)).forEach(e=>{
      const current = Math.max(0, stock[e.product]?.quantity || 0);
      const min = num(minimumLevels[e.product]);
      const status = statusFor(current,min).text;
      lines.push([
        e.date,e.product,e.type,e.counterparty || "",e.quantity,
        current,min || "",status,e.note || ""
      ].map(csvCell).join(","));
    });

    downloadBlob(`stock-ledger-report-${today()}.csv`, lines.join("\n"), "text/csv;charset=utf-8");
  }

  async function restoreBackupFile(file) {
    try {
      const payload = JSON.parse(await file.text());
      if (!payload || payload.app !== "LEDGER-APP" || !Array.isArray(payload.transactions)) {
        throw new Error("Invalid LEDGER-APP backup file.");
      }

      if (!confirm(
        "RESTORE WILL REPLACE the current online ledger transactions.\n\n" +
        "Make sure you have a fresh backup first.\n\nContinue?"
      )) return;

      const client = await ensureSupabase();

      const rows = payload.transactions.map(e => ({
        id:e.id || crypto.randomUUID(),
        product:String(e.product||"").trim(),
        type:e.type,
        counterparty:String(e.counterparty||""),
        adjustment_direction:e.type==="adjustment" ? (e.adjustmentDirection||"increase") : null,
        quantity:num(e.quantity),
        unit_price:0,
        date:e.date,
        note:String(e.note||"")
      })).filter(e=>e.product && e.quantity > 0 && e.date);

      const { error: deleteError } = await client.from("ledger_entries").delete().neq("id","00000000-0000-0000-0000-000000000000");
      if (deleteError) throw deleteError;

      if (rows.length) {
        const { error } = await client.from("ledger_entries").insert(rows);
        if (error) throw error;
      }

      const levels = payload.minimumStockLevels || {};
      const levelRows = Object.entries(levels).map(([product,minimum_stock])=>({
        product, minimum_stock:Math.max(0,Math.floor(num(minimum_stock))),
        updated_at:new Date().toISOString()
      }));

      if (levelRows.length) {
        const { error } = await client.from("product_stock_settings")
          .upsert(levelRows,{onConflict:"product"});
        if (error) throw error;
      }

      await refreshEntries();
      await refreshMinimumLevels();
      alert("Backup restored successfully.");
    } catch(e) {
      alert("Restore failed.\n\n"+e.message);
    }
  }

  function setupSearch() {
    const input = $("stockSearch"), clear = $("clearStockSearch");
    if (input) input.addEventListener("input",()=>{
      stockSearch=input.value.trim();
      clear?.classList.toggle("hidden",!stockSearch);
      renderStockTable();
    });
    clear?.addEventListener("click",()=>{
      input.value=""; stockSearch=""; clear.classList.add("hidden"); renderStockTable(); input.focus();
    });

    const p = $("pageSearch"), pc = $("clearPageSearch");
    if (p) p.addEventListener("input",()=>{
      pageSearch=p.value.trim();
      pc?.classList.toggle("hidden",!pageSearch);
      renderAll();
    });
    pc?.addEventListener("click",()=>{
      p.value=""; pageSearch=""; pc.classList.add("hidden"); renderAll(); p.focus();
    });
  }

  function setupReminders() {
    const add=$("addReminderBtn"), wrap=$("reminderFormWrap"), form=$("reminderForm"), cancel=$("cancelReminderBtn");
    if (!add || !wrap || !form) return;

    function get() {
      try { return JSON.parse(localStorage.getItem(REMINDER_KEY)||"[]"); } catch { return []; }
    }
    function render() {
      const box=$("remindersList"), data=get();
      if (!box) return;
      box.innerHTML = data.length ? data.map(r=>`
        <div class="reminder-item"><span>📌</span><strong>${esc(r.text)}</strong>
        <button class="delete-reminder" data-rid="${r.id}">×</button></div>`).join("") :
        `<div class="alert-empty">No reminders added yet.</div>`;
      box.querySelectorAll("[data-rid]").forEach(b=>b.onclick=()=>{
        localStorage.setItem(REMINDER_KEY,JSON.stringify(get().filter(r=>String(r.id)!==String(b.dataset.rid))));
        render();
      });
    }
    add.onclick=()=>{wrap.classList.remove("hidden");$("reminderText").focus();};
    cancel.onclick=()=>{form.reset();wrap.classList.add("hidden");};
    form.onsubmit=e=>{
      e.preventDefault();
      const text=$("reminderText").value.trim(); if(!text)return;
      const data=get(); data.unshift({id:Date.now(),text});
      localStorage.setItem(REMINDER_KEY,JSON.stringify(data));
      form.reset();wrap.classList.add("hidden");render();
    };
    render();
  }

  function renderAll() {
    renderStats(); renderStockTable(); renderAlerts();
    renderReceivedPage(); renderIssuedPage(); renderHistoryPage();
  }

  async function init() {
    localLoad();
    if ($("date")) $("date").value=today();
    setupSearch();
    setupReminders();
    setupNotifications();

    $("ledgerForm")?.addEventListener("submit",handleSubmit);
    $("type")?.addEventListener("change",updateTransactionUI);
    $("editForm")?.addEventListener("submit",handleEdit);
    $("cancelEditBtn")?.addEventListener("click",()=>$("editFormPanel")?.classList.add("hidden"));
    $("downloadBackupBtn")?.addEventListener("click",downloadBackup);
    $("downloadCsvBtn")?.addEventListener("click",downloadCsv);
    $("restoreBackupBtn")?.addEventListener("click",()=>$("restoreBackupInput")?.click());
    $("restoreBackupInput")?.addEventListener("change",e=>e.target.files[0]&&restoreBackupFile(e.target.files[0]));

    updateTransactionUI();
    renderAll();

    try {
      await ensureSupabase();
      await refreshEntries();
      await refreshMinimumLevels();
      await refreshNotifications();
      subscribeRealtime();
      setSync("● Online & Synced",true);
    } catch(e) {
      console.error(e);
      setSync("Offline / Check Supabase");
    }
  }

  if (document.readyState==="loading") document.addEventListener("DOMContentLoaded",()=>init());
  else init();
})();