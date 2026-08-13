LEDGER-APP QUANTITY + BACKUP V2
================================

FILES
-----
index.html
received.html
issued.html
history.html
app.js
styles.css
supabase-stock-levels.sql

IMPORTANT
---------
1. BACKUP BEFORE REPLACEMENT.
2. Replace the existing files with these files.
3. Run supabase-stock-levels.sql ONCE in Supabase SQL Editor.
4. Push to GitHub and deploy on Vercel.

WHAT CHANGED
------------
- Removed all cost/value UI.
- Unit price is no longer requested by the user.
- Quantity is the main focus.
- Dashboard shows Received, Issued, Current Stock and Low Stock.
- Product search on Current Stock.
- Minimum stock can be set individually per product.
- Minimum stock is saved in Supabase and syncs across devices.
- Received/Issued/History have search.
- Edit and Delete are retained.
- Full JSON backup can be downloaded manually.
- CSV quantity report can be downloaded manually.
- JSON backup can be restored to Supabase.
- Backup does NOT include cost values.
- Realtime remains enabled for ledger transactions and stock settings.

BACKUP
------
Download Full Backup:
  stock-ledger-backup-YYYY-MM-DD.json

CSV:
  stock-ledger-report-YYYY-MM-DD.csv

RESTORE WARNING
---------------
Restore replaces the current online ledger transactions.
Always download a fresh backup before restoring.

SUPABASE KEY
------------
app.js contains the publishable key supplied in the previous
conversation. Never put a secret/service_role key in browser code.
