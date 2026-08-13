LEDGER-APP — CUSTOM STOCK LEVEL + PRODUCT SEARCH
==================================================

FEATURES
--------
1. Search Current Stock instantly.
2. Set a different Minimum Stock Level for every product.
3. Save minimum levels in Supabase.
4. Status:
   - GOOD
   - WARNING
   - LOW
   - NOT SET
5. Existing ledger entries remain unchanged.

INSTALLATION
------------

STEP 1 — Supabase
-----------------
Open Supabase > SQL Editor.

Run:
    supabase-stock-levels.sql

IMPORTANT:
The policy role in the SQL is "authenticated".
If your existing ledger_entries table works through "anon"
with the publishable key, change "authenticated" to "anon"
in the four policies before running.

STEP 2 — index.html
-------------------
Inside the Current Stock panel, replace the current section
header:

    <div class="section-header">
      <h2>Current Stock</h2>
    </div>

with the contents of:

    stock-toolbar.html

Keep the existing <div class="table-wrap"> and table.

The current table should be changed to these headings:

    Product
    Qty In Stock
    Minimum Level
    Status
    Level
    Avg Cost
    Stock Value

If you want the simplest version, keep only:
    Product
    Qty In Stock
    Minimum Level
    Status

and adjust the colspan in app.js accordingly.

STEP 3 — styles.css
-------------------
Add:
    styles-stock-level-search.css

to the END of styles.css.

STEP 4 — app.js
---------------
Add:
    app-stock-level-search.js

to the END of your existing app.js.

IMPORTANT:
The add-on needs access to the existing Supabase client.

If your current app creates the client like:

    supabaseClient = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY
    );

add this immediately after it:

    window.stockLedgerSupabaseClient = supabaseClient;

If your current app already exposes its client, do not add it twice.

IMPORTANT ABOUT THE TABLE
-------------------------
The JS renders a custom Current Stock table. It expects
stockTableBody to exist.

For a clean integration, use the provided HTML toolbar and
change the table headers to match the generated columns.

SEARCH
------
Type:
    60X40X40

Only matching products remain visible.

MINIMUM STOCK
-------------
Example:

    Product: 60X40X40
    Current: 80
    Minimum: 50
    Status: GOOD

If Current becomes 50 or below:
    LOW

If Current is above 50 but within 150% of minimum:
    WARNING

Above that:
    GOOD

If minimum is 0:
    NOT SET

NO EXISTING LEDGER DATA IS DELETED.
