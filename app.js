async function saveTransaction(event) {
  event.preventDefault();

  console.log("========== SAVE TRANSACTION START ==========");

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


  /* =====================================================
     VALIDATION
     ===================================================== */

  if (!product) {
    alert("Product name enter karein.");
    return;
  }

  if (!quantity || quantity <= 0) {
    alert("Valid quantity enter karein.");
    return;
  }

  if (!date) {
    alert("Date select karein.");
    return;
  }


  /* =====================================================
     SUPABASE ROW
     ONLY REAL DATABASE COLUMNS
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


  console.log(
    "Row going to Supabase:",
    row
  );


  /* =====================================================
     SUPABASE CLIENT
     ===================================================== */

  const client =
    getSupabaseClient();


  if (!client) {

    console.error(
      "Supabase client unavailable."
    );

    alert(
      "Supabase load nahi hua.\n\n" +
      "Browser Console check karein."
    );

    return;
  }


  /* =====================================================
     INSERT INTO SUPABASE
     ===================================================== */

  try {

    console.log(
      "Sending INSERT request..."
    );


    const {
      error
    } = await client
      .from("ledger_entries")
      .insert(row);


    /* ===================================================
       INSERT ERROR
       =================================================== */

    if (error) {

      console.error(
        "SUPABASE INSERT ERROR:",
        error
      );

      console.error(
        "Error code:",
        error.code
      );

      console.error(
        "Error message:",
        error.message
      );

      console.error(
        "Error details:",
        error.details
      );

      console.error(
        "Error hint:",
        error.hint
      );


      alert(
        "❌ Record save nahi hua.\n\n" +
        "Supabase Error:\n" +
        error.message
      );

      return;
    }


    /* ===================================================
       INSERT SUCCESS
       =================================================== */

    console.log(
      "✅ INSERT SUCCESS"
    );

    console.log(
      "Saved ID:",
      row.id
    );


    /* ===================================================
       VERIFY RECORD
       =================================================== */

    console.log(
      "Verifying saved record..."
    );


    const {
      data: verifyData,
      error: verifyError
    } = await client
      .from("ledger_entries")
      .select("*")
      .eq("id", row.id)
      .maybeSingle();


    if (verifyError) {

      console.warn(
        "Record inserted, but verification failed:",
        verifyError
      );

    } else if (!verifyData) {

      console.warn(
        "Insert reported success but record could not be read."
      );

    } else {

      console.log(
        "✅ RECORD VERIFIED:",
        verifyData
      );

    }


    /* ===================================================
       SUCCESS MESSAGE
       =================================================== */

    alert(
      "✅ Transaction successfully save ho gayi."
    );


    /* =========================================================
   RESET MAIN FORM
   ========================================================= */

function resetMainForm() {

  if ($("ledgerForm")) {
    $("ledgerForm").reset();
  }

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


    /* ===================================================
       RELOAD FROM SUPABASE
       =================================================== */

    console.log(
      "Reloading Supabase records..."
    );


    await loadEntries();


    console.log(
      "========== SAVE TRANSACTION END =========="
    );


  } catch (error) {

    console.error(
      "❌ SUPABASE SAVE EXCEPTION:",
      error
    );


    alert(
      "❌ Supabase connection/save error.\n\n" +
      error.message
    );

  }
}