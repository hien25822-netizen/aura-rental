# Apps Script Code

**Project:** Aura Rental
**Last Updated:** 2026-06-27

---

## ⚠️ EXPERIMENTAL - TESTING IN PROGRESS

**Feature:** Aura Rental Apps Script backend (V6)
**Status:** ⚠ EXPERIMENTAL - NOT YET DEPLOYED
**Started:** 2026-06-27
**Purpose:** Server-side automation for Aura Rental dress-rental shop — auto OrderId generation, payment refund stamping, cascade soft-delete, and editable date validation.

### What's New

- `setupTriggers()` — idempotent installer for onChange / onEdit / onFormSubmit
- `onChangeHandler(e)` — dispatcher by sheet name
- `onEditHandler(e)` — guards PickupDate <= ReturnDate
- `generateOrderId()` — atomic counter using LockService, format `A00001`
- `handleOrdersChange(sheet)` — auto-stamps OrderId on new rows + cascade soft-delete to order_dresses
- `handlePaymentsChange(sheet)` — auto-sets IsRefunded=TRUE, RefundedAt=NOW() + snapshot columns
- `handleError(err, fn)` — owner email on failure

### Changes Summary

- Single file `AppsScript_AuraRental.gs` consolidating all V6 automation
- LockService-protected counter (no duplicate `A00001` even with concurrent edits)
- Snapshot columns (OrderIdSnap, DressCodeSnap, etc.) automatically copied when a payment is created
- Owner-only email notification on script failure (no PII sent)

### Testing Checklist

- [ ] Run `setupTriggers()` manually once
- [ ] Confirm 3 triggers appear in Triggers list
- [ ] Add a row to `orders` — OrderId populates as `A00001`
- [ ] Add a row to `payments` — IsRefunded, RefundedAt, and all Snap columns auto-fill
- [ ] Set PickupDate > ReturnDate in `orders` — error toast appears
- [ ] Set IsDeleted=TRUE on an `orders` row — all matching `order_dresses` rows also flagged
- [ ] Simulate error (rename a sheet) — owner email arrives
- [ ] Idempotent: run `setupTriggers()` twice — no duplicate triggers

### Rollback Instructions

1. Open Apps Script editor → Triggers (clock icon)
2. Delete the three Aura Rental triggers
3. File → Manage versions → Revert to previous version
4. OR delete `AppsScript_AuraRental.gs` and restore from backup

---

## ✅ STABLE SYSTEM

**Version:** V6
**Last Updated:** 2026-06-27

---

## 📋 TABLE OF CONTENTS

1. [System Overview](#-system-overview)
2. [Configuration Constants](#configuration-constants)
3. [Functions](#functions)
4. [Installation Guide](#installation-guide)
5. [Testing & Monitoring](#testing--monitoring)
6. [Troubleshooting](#troubleshooting)
7. [Rollback Procedures](#rollback-procedures)

---

## 📋 SYSTEM OVERVIEW

**Key Features:**
- **Idempotent trigger installer** — `setupTriggers()` can be run repeatedly without duplicating triggers
- **Atomic OrderId generator** — `generateOrderId()` uses `LockService` to guarantee a unique `A00001`-style ID under concurrent edits
- **Cascade soft-delete** — setting `IsDeleted=TRUE` on an `orders` row automatically flags every matching `order_dresses` row
- **Refund auto-stamp** — entering a row in `payments` automatically sets `IsRefunded=TRUE`, `RefundedAt=NOW()`, and copies snapshot columns from the source order
- **Date validation** — `onEditHandler` blocks any edit where `PickupDate > ReturnDate` in the `orders` sheet
- **Owner email on failure** — every handler is wrapped in `handleError(err, fn)` which emails the owner and rethrows

---

## Configuration Constants

These constants sit at the top of `AppsScript_AuraRental.gs`. Update them once per spreadsheet.

```javascript
// ============================================================
// CONFIGURATION CONSTANTS
// ============================================================

const CONFIG = {
  // Sheet names (must match googlesheet_formulas.md exactly)
  SHEETS: {
    ORDERS: 'orders',
    ORDER_DRESSES: 'order_dresses',
    DRESSES: 'dresses',
    ACCESSORIES: 'accessories',
    PAYMENTS: 'payments',
    AVAILABILITY_CHECKS: 'availability_checks',
    FORM_SUBMISSIONS: 'form_submissions'
  },

  // Column names (English, matching the header row of each sheet)
  COLUMNS: {
    // orders
    ORDER_ID: 'OrderId',
    PICKUP_DATE: 'PickupDate',
    RETURN_DATE: 'ReturnDate',
    IS_DELETED: 'IsDeleted',
    // order_dresses
    DRESS_CODE: 'DressCode',
    // payments
    IS_REFUNDED: 'IsRefunded',
    REFUNDED_AT: 'RefundedAt',
    // snapshot columns
    ORDER_ID_SNAP: 'OrderIdSnap',
    DRESS_CODE_SNAP: 'DressCodeSnap',
    AMOUNT_SNAP: 'AmountSnap',
    CUSTOMER_SNAP: 'CustomerSnap',
    PACKAGE_SNAP: 'PackageSnap',
    PICKUP_DATE_SNAP: 'PickupDateSnap',
    RETURN_DATE_SNAP: 'ReturnDateSnap'
  },

  // Counter key (Script Property) holding the last issued OrderId number
  COUNTER_KEY: 'AURA_ORDER_COUNTER',

  // Owner email (recipient of failure notifications)
  OWNER_EMAIL: 'owner@example.com'
};
```

---

## Functions

---

### Function: setupTriggers

**Purpose:** Install (or reinstall) the three Aura Rental triggers: `onChangeHandler`, `onEditHandler`, and `onFormSubmitHandler`. Idempotent — safe to run multiple times.

**Trigger Type:** Manual (run once from the Apps Script editor)

**File Location:** Extensions → Apps Script → `AppsScript_AuraRental.gs`

**Authorization Required:** `https://www.googleapis.com/auth/script.scriptapp` (Triggers)

**Created:** 2026-06-27
**Last Modified:** 2026-06-27

**Parameters:** None

**Returns:** None (logs confirmation)

**Code:**

```javascript
/**
 * Install (or reinstall) all Aura Rental triggers idempotently.
 * Safe to call repeatedly — duplicates are removed before insertion.
 *
 * @return {void}
 */
function setupTriggers() {
  try {
    const existing = ScriptApp.getProjectTriggers();
    const handlers = ['onChangeHandler', 'onEditHandler', 'onFormSubmitHandler'];

    // Remove any existing Aura Rental triggers first (idempotency)
    existing.forEach(trigger => {
      const fn = trigger.getHandlerFunction();
      if (handlers.indexOf(fn) !== -1) {
        ScriptApp.deleteTrigger(trigger);
      }
    });

    // Install onChange — catches row inserts / structural edits
    ScriptApp.newTrigger('onChangeHandler')
      .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
      .onChange()
      .create();

    // Install onEdit — catches single-cell edits (date validation)
    ScriptApp.newTrigger('onEditHandler')
      .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
      .onEdit()
      .create();

    // Install onFormSubmit — catches new form rows in form_submissions
    ScriptApp.newTrigger('onFormSubmitHandler')
      .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
      .onFormSubmit()
      .create();

    Logger.log('Aura Rental triggers installed: ' + handlers.join(', '));
  } catch (err) {
    handleError(err, 'setupTriggers');
  }
}
```

**Installation Steps:**
1. Open the Aura Rental Google Sheet → **Extensions → Apps Script**
2. Create a new file: **AppsScript_AuraRental.gs** (or open existing)
3. Paste the `setupTriggers` code block above
4. Save (Ctrl+S / Cmd+S)
5. Select `setupTriggers` from the function dropdown → click **Run**
6. Accept the authorization popup (review permissions → **Allow**)

**Setting Up Triggers:**
This function IS the trigger setup — running it installs the three triggers automatically. No manual Triggers UI work is required.

**Testing Checklist:**
- [ ] Run `setupTriggers` manually, check **Execution Log** (View → Logs)
- [ ] Open **Triggers** (clock icon) — exactly 3 Aura Rental triggers appear
- [ ] Run `setupTriggers` a second time — still exactly 3 triggers (idempotent)
- [ ] No "Authorization required" warning appears

---

### Function: onChangeHandler

**Purpose:** Dispatcher fired on any spreadsheet structural change (row insert, delete, edit). Routes the event to the right sheet-specific handler.

**Trigger Type:** Event-driven (On Change)

**File Location:** Extensions → Apps Script → `AppsScript_AuraRental.gs`

**Authorization Required:** Spreadsheet access (granted at install)

**Created:** 2026-06-27
**Last Modified:** 2026-06-27

**Parameters:**
- `e` (Object): Apps Script event object. Uses `e.source` to get the active spreadsheet and `e.changeType` to inspect the kind of change.

**Returns:** None

**Code:**

```javascript
/**
 * On-change dispatcher. Routes by sheet name.
 *
 * @param {Object} e - Apps Script onChange event
 * @return {void}
 */
function onChangeHandler(e) {
  try {
    const ss = e.source;
    if (!ss) return;

    const activeSheet = ss.getActiveSheet();
    if (!activeSheet) return;

    const sheetName = activeSheet.getName();

    if (sheetName === CONFIG.SHEETS.ORDERS) {
      handleOrdersChange(activeSheet);
    } else if (sheetName === CONFIG.SHEETS.PAYMENTS) {
      handlePaymentsChange(activeSheet);
    }
    // Other sheets intentionally ignored
  } catch (err) {
    handleError(err, 'onChangeHandler');
  }
}
```

**Installation Steps:** Included automatically by `setupTriggers()`.

**Testing Checklist:**
- [ ] Add a row to `orders` — confirm `handleOrdersChange` fires (Execution Log shows entry)
- [ ] Add a row to `payments` — confirm `handlePaymentsChange` fires
- [ ] Add a row to `dresses` — nothing happens (intentional)
- [ ] Verify no error in Execution Log

**Troubleshooting:**
- **`handleOrdersChange is not defined`** → File was not saved before running setup; reopen and re-save
- **Trigger never fires** → Open Triggers list and confirm the entry exists

---

### Function: onEditHandler

**Purpose:** Validate that `PickupDate <= ReturnDate` whenever the user edits a date cell in the `orders` sheet. Reverts the cell and shows a toast if violated.

**Trigger Type:** Event-driven (On Edit)

**File Location:** Extensions → Apps Script → `AppsScript_AuraRental.gs`

**Authorization Required:** None (simple trigger runs as editing user)

**Created:** 2026-06-27
**Last Modified:** 2026-06-27

**Parameters:**
- `e` (Object): Apps Script onEdit event. Contains `range`, `sheet`, `value`, `oldValue`.

**Returns:** None

**Code:**

```javascript
/**
 * On-edit validator. Ensures PickupDate <= ReturnDate in the orders sheet.
 *
 * @param {Object} e - Apps Script onEdit event
 * @return {void}
 */
function onEditHandler(e) {
  try {
    const range = e.range;
    const sheet = range.getSheet();
    if (!sheet) return;

    if (sheet.getName() !== CONFIG.SHEETS.ORDERS) return;

    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const pickupCol = headerRow.indexOf(CONFIG.COLUMNS.PICKUP_DATE) + 1;
    const returnCol = headerRow.indexOf(CONFIG.COLUMNS.RETURN_DATE) + 1;

    if (pickupCol === 0 || returnCol === 0) return;
    if (range.getColumn() !== pickupCol && range.getColumn() !== returnCol) return;

    const row = range.getRow();
    if (row === 1) return; // header

    const pickupVal = sheet.getRange(row, pickupCol).getValue();
    const returnVal = sheet.getRange(row, returnCol).getValue();

    if (!(pickupVal instanceof Date) || !(returnVal instanceof Date)) return;
    if (pickupVal.getTime() > returnVal.getTime()) {
      // Revert
      range.setValue(e.oldValue);
      SpreadsheetApp.getUi().alert(
        'PickupDate must be on or before ReturnDate. Edit reverted.'
      );
    }
  } catch (err) {
    handleError(err, 'onEditHandler');
  }
}
```

**Installation Steps:** Included automatically by `setupTriggers()`.

**Testing Checklist:**
- [ ] Set `PickupDate = 2026-07-10`, `ReturnDate = 2026-07-05` — alert appears, cell reverts
- [ ] Set `PickupDate = 2026-07-05`, `ReturnDate = 2026-07-10` — no alert
- [ ] Edit a cell in any other column — nothing happens
- [ ] Edit in `dresses` sheet — nothing happens

**Troubleshooting:**
- **Alert never appears** → Confirm the trigger is installed and the column header text matches `PickupDate` / `ReturnDate` exactly
- **Wrong cell reverts** → Check `e.oldValue` capture (must come from simple On Edit trigger, not installable)

---

### Function: generateOrderId

**Purpose:** Atomically generate the next OrderId (format `A00001`, `A00002`, …) using `LockService` to prevent duplicate IDs under concurrent edits.

**Trigger Type:** Called by `handleOrdersChange` (not directly triggered)

**File Location:** Extensions → Apps Script → `AppsScript_AuraRental.gs`

**Authorization Required:** `https://www.googleapis.com/auth/script.properties` (Script Properties)

**Created:** 2026-06-27
**Last Modified:** 2026-06-27

**Parameters:** None

**Returns:**
- String: A zero-padded 5-digit ID prefixed with `A` (e.g. `A00042`)

**Code:**

```javascript
/**
 * Atomically generate the next OrderId using LockService.
 * Format: A00001, A00002, ... (zero-padded to 5 digits).
 *
 * @return {string} The newly minted OrderId
 */
function generateOrderId() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000); // up to 20s

  try {
    const props = PropertiesService.getScriptProperties();
    const current = parseInt(props.getProperty(CONFIG.COUNTER_KEY) || '0', 10);
    const next = current + 1;
    props.setProperty(CONFIG.COUNTER_KEY, String(next));
    return 'A' + String(next).padStart(5, '0');
  } finally {
    lock.releaseLock();
  }
}
```

**Installation Steps:** No separate installation — function is called from `handleOrdersChange`.

**Testing Checklist:**
- [ ] Call `generateOrderId()` twice in a row — get `A00001`, then `A00002`
- [ ] Verify Script Property `AURA_ORDER_COUNTER` incremented (File → Project Properties → Script Properties)
- [ ] Add 5 rows rapidly to `orders` — IDs are sequential, no duplicates
- [ ] Trigger counter from 100 manually → next ID is `A00101`

**Troubleshooting:**
- **`Lock wait timeout`** → Another process held the lock > 20s; reduce concurrency or extend timeout
- **Counter never increments** → Check script has Properties permission; re-authorize if needed
- **Duplicate IDs** → Confirm `waitLock` is reached before reading the property

---

### Function: handleOrdersChange

**Purpose:** When a new row appears in `orders`, auto-stamp the `OrderId` column. When `IsDeleted=TRUE` is set on an order, cascade the soft-delete to all matching rows in `order_dresses`.

**Trigger Type:** Called by `onChangeHandler`

**File Location:** Extensions → Apps Script → `AppsScript_AuraRental.gs`

**Authorization Required:** Spreadsheet edit access

**Created:** 2026-06-27
**Last Modified:** 2026-06-27

**Parameters:**
- `sheet` (Sheet): The active `orders` sheet object

**Returns:** None

**Code:**

```javascript
/**
 * Process changes in the orders sheet:
 *  1. Stamp OrderId on any new row missing one.
 *  2. Cascade IsDeleted=TRUE to matching rows in order_dresses.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The orders sheet
 * @return {void}
 */
function handleOrdersChange(sheet) {
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const orderIdCol = headerRow.indexOf(CONFIG.COLUMNS.ORDER_ID) + 1;
    const isDeletedCol = headerRow.indexOf(CONFIG.COLUMNS.IS_DELETED) + 1;

    if (orderIdCol === 0) return; // header missing — bail

    const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

    data.forEach((row, idx) => {
      const rowNum = idx + 2;

      // 1. Stamp OrderId if missing
      if (!row[orderIdCol - 1]) {
        const newId = generateOrderId();
        sheet.getRange(rowNum, orderIdCol).setValue(newId);
        row[orderIdCol - 1] = newId; // keep local copy in sync
      }

      // 2. Cascade soft-delete
      if (isDeletedCol > 0 && row[isDeletedCol - 1] === true) {
        cascadeSoftDelete(row[orderIdCol - 1]);
      }
    });
  } catch (err) {
    handleError(err, 'handleOrdersChange');
  }
}

/**
 * Mark all matching rows in order_dresses as IsDeleted=TRUE.
 *
 * @param {string} orderId - The OrderId whose child rows should be flagged
 * @return {void}
 */
function cascadeSoftDelete(orderId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const childSheet = ss.getSheetByName(CONFIG.SHEETS.ORDER_DRESSES);
  if (!childSheet || !orderId) return;

  const lastRow = childSheet.getLastRow();
  if (lastRow < 2) return;

  const headerRow = childSheet.getRange(1, 1, 1, childSheet.getLastColumn()).getValues()[0];
  const orderIdCol = headerRow.indexOf(CONFIG.COLUMNS.ORDER_ID) + 1;
  const isDeletedCol = headerRow.indexOf(CONFIG.COLUMNS.IS_DELETED) + 1;
  if (orderIdCol === 0 || isDeletedCol === 0) return;

  const data = childSheet.getRange(2, orderIdCol, lastRow - 1, 1).getValues();
  data.forEach((row, idx) => {
    if (row[0] === orderId) {
      childSheet.getRange(idx + 2, isDeletedCol).setValue(true);
    }
  });
}
```

**Installation Steps:** No separate installation — installed automatically by `setupTriggers()` and called by `onChangeHandler`.

**Testing Checklist:**
- [ ] Add new row to `orders` with empty OrderId — auto-fills with `A0000X`
- [ ] Add new row with OrderId already filled — no overwrite
- [ ] Set `IsDeleted=TRUE` on an existing order — matching `order_dresses` rows become TRUE
- [ ] Confirm Execution Log shows the cascade write

**Troubleshooting:**
- **OrderId column overwrites user value** → Check the `if (!row[…])` guard is in place
- **Cascade misses some rows** → Confirm `OrderId` values match exactly (case-sensitive, no trailing spaces)

---

### Function: handlePaymentsChange

**Purpose:** When a new row appears in `payments`, auto-set `IsRefunded=TRUE`, `RefundedAt=NOW()`, and copy snapshot columns from the source order.

**Trigger Type:** Called by `onChangeHandler`

**File Location:** Extensions → Apps Script → `AppsScript_AuraRental.gs`

**Authorization Required:** Spreadsheet edit access

**Created:** 2026-06-27
**Last Modified:** 2026-06-27

**Parameters:**
- `sheet` (Sheet): The active `payments` sheet object

**Returns:** None

**Code:**

```javascript
/**
 * Process changes in the payments sheet:
 *  1. Auto-stamp IsRefunded=TRUE and RefundedAt=NOW().
 *  2. Copy snapshot columns from the source order.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The payments sheet
 * @return {void}
 */
function handlePaymentsChange(sheet) {
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const orderIdCol = headerRow.indexOf(CONFIG.COLUMNS.ORDER_ID) + 1;
    if (orderIdCol === 0) return;

    const data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

    data.forEach((row, idx) => {
      const rowNum = idx + 2;
      const orderId = row[orderIdCol - 1];
      if (!orderId) return;

      // 1. Stamp IsRefunded + RefundedAt if missing
      const isRefundedCol = headerRow.indexOf(CONFIG.COLUMNS.IS_REFUNDED) + 1;
      const refundedAtCol = headerRow.indexOf(CONFIG.COLUMNS.REFUNDED_AT) + 1;
      if (isRefundedCol > 0 && !row[isRefundedCol - 1]) {
        sheet.getRange(rowNum, isRefundedCol).setValue(true);
      }
      if (refundedAtCol > 0 && !row[refundedAtCol - 1]) {
        sheet.getRange(rowNum, refundedAtCol).setValue(new Date());
      }

      // 2. Snapshot source-order columns
      copyPaymentSnapshots(sheet, rowNum, orderId, headerRow);
    });
  } catch (err) {
    handleError(err, 'handlePaymentsChange');
  }
}

/**
 * Copy snapshot columns from the source order into the payments row.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - The payments sheet
 * @param {number} rowNum - The payments row being processed
 * @param {string} orderId - Source OrderId
 * @param {string[]} headerRow - Header row of the payments sheet
 * @return {void}
 */
function copyPaymentSnapshots(sheet, rowNum, orderId, headerRow) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ordersSheet = ss.getSheetByName(CONFIG.SHEETS.ORDERS);
  if (!ordersSheet) return;

  const ordersHeader = ordersSheet.getRange(1, 1, 1, ordersSheet.getLastColumn()).getValues()[0];
  const ordersOrderIdCol = ordersHeader.indexOf(CONFIG.COLUMNS.ORDER_ID) + 1;
  if (ordersOrderIdCol === 0) return;

  const ordersData = ordersSheet.getDataRange().getValues();
  const matchRow = ordersData.find(r => r[ordersOrderIdCol - 1] === orderId);
  if (!matchRow) return;

  const snapMap = [
    [CONFIG.COLUMNS.ORDER_ID_SNAP, CONFIG.COLUMNS.ORDER_ID],
    [CONFIG.COLUMNS.CUSTOMER_SNAP, 'CustomerName'],
    [CONFIG.COLUMNS.PACKAGE_SNAP, 'Package'],
    [CONFIG.COLUMNS.PICKUP_DATE_SNAP, CONFIG.COLUMNS.PICKUP_DATE],
    [CONFIG.COLUMNS.RETURN_DATE_SNAP, CONFIG.COLUMNS.RETURN_DATE],
    [CONFIG.COLUMNS.AMOUNT_SNAP, 'Amount']
  ];

  snapMap.forEach(([snapCol, srcCol]) => {
    const payCol = headerRow.indexOf(snapCol) + 1;
    const srcIdx = ordersHeader.indexOf(srcCol);
    if (payCol > 0 && srcIdx >= 0) {
      const currentVal = sheet.getRange(rowNum, payCol).getValue();
      if (!currentVal) {
        sheet.getRange(rowNum, payCol).setValue(matchRow[srcIdx]);
      }
    }
  });
}
```

**Installation Steps:** No separate installation — installed automatically by `setupTriggers()`.

**Testing Checklist:**
- [ ] Add a payment row with valid `OrderId` — `IsRefunded=TRUE`, `RefundedAt` populated
- [ ] Confirm snapshot columns auto-fill (CustomerName, Package, dates, Amount)
- [ ] Re-edit the same payment — values are NOT overwritten (because already present)
- [ ] Add a payment with non-existent `OrderId` — only IsRefunded/RefundedAt set; snapshots blank

**Troubleshooting:**
- **RefundedAt shows blank** → Check column header text matches `RefundedAt` exactly
- **Snapshot columns empty** → Confirm the source order row exists in the `orders` sheet

---

### Function: handleError

**Purpose:** Centralised error reporter. Emails the owner with the error details and rethrows so the failure is visible in the Execution Log.

**Trigger Type:** Called by every handler in this file

**File Location:** Extensions → Apps Script → `AppsScript_AuraRental.gs`

**Authorization Required:** `https://www.googleapis.com/auth/script.send_mail`

**Created:** 2026-06-27
**Last Modified:** 2026-06-27

**Parameters:**
- `err` (Error): The caught error object
- `fn` (String): Name of the function where the error occurred

**Returns:** None (rethrows after logging)

**Code:**

```javascript
/**
 * Centralised error handler. Emails owner and rethrows.
 *
 * @param {Error} err - The caught error
 * @param {string} fn - Function name where the error originated
 * @return {void}
 */
function handleError(err, fn) {
  const subject = '[Aura Rental] Script error in ' + fn;
  const body = [
    'Function: ' + fn,
    'Time: ' + new Date().toISOString(),
    'Message: ' + (err && err.message ? err.message : String(err)),
    'Stack: ' + (err && err.stack ? err.stack : '(no stack)')
  ].join('\n');

  try {
    MailApp.sendEmail(CONFIG.OWNER_EMAIL, subject, body);
  } catch (mailErr) {
    Logger.log('Failed to send error email: ' + mailErr);
  }

  Logger.log(subject + '\n' + body);
  throw err;
}
```

**Installation Steps:** No separate installation — defined alongside other functions.

**Testing Checklist:**
- [ ] Temporarily rename a sheet → trigger fires → owner email arrives within 1 minute
- [ ] Confirm email subject format is `[Aura Rental] Script error in <fn>`
- [ ] Confirm Execution Log contains full error + stack

**Troubleshooting:**
- **No email arrives** → Confirm `CONFIG.OWNER_EMAIL` is correct; check spam folder
- **Script sends emails on every edit** → Wrap noisy code in try/catch and call `Logger.log` only

---

### Function: onFormSubmitHandler

**Purpose:** Stub handler for new rows arriving via Google Forms into the `form_submissions` sheet. Logs the event and (in future versions) will fan out to create `orders` drafts.

**Trigger Type:** Event-driven (On Form Submit)

**File Location:** Extensions → Apps Script → `AppsScript_AuraRental.gs`

**Authorization Required:** Spreadsheet edit access

**Created:** 2026-06-27
**Last Modified:** 2026-06-27

**Parameters:**
- `e` (Object): Apps Script onFormSubmit event

**Returns:** None

**Code:**

```javascript
/**
 * On-form-submit stub. Logs receipt for now; future versions will
 * create draft orders from form_submissions rows.
 *
 * @param {Object} e - Apps Script onFormSubmit event
 * @return {void}
 */
function onFormSubmitHandler(e) {
  try {
    Logger.log('form_submissions row received: ' + JSON.stringify(e.values || []));
  } catch (err) {
    handleError(err, 'onFormSubmitHandler');
  }
}
```

**Installation Steps:** Included automatically by `setupTriggers()`.

**Testing Checklist:**
- [ ] Submit the linked Google Form → Execution Log shows the receipt line
- [ ] No error email sent

**Troubleshooting:**
- **Trigger never fires** → Confirm the form is bound to THIS spreadsheet, not a separate one

---

## Installation Guide

### Prerequisites

- Owner account with edit access to the Aura Rental Google Sheet
- Mail access for `CONFIG.OWNER_EMAIL`

### Step-by-Step

1. **Open the target Google Sheet** in a browser.
2. Click **Extensions** in the menu bar → **Apps Script**.
3. In the Apps Script editor, click **+** → **Script** to create a new file.
4. Name the file **`AppsScript_AuraRental.gs`** (delete the default `Code.gs` content if you wish).
5. **Paste the entire file content** (constants block + all functions) into the editor.
6. **Update `CONFIG.OWNER_EMAIL`** in the constants block to your real email.
7. Click the **Save** icon (💾) or press **Ctrl+S / Cmd+S**.
8. In the function dropdown, select **`setupTriggers`**.
9. Click **Run**. The first run will show an **Authorization required** dialog:
   - Click **Review Permissions** → choose your Google account
   - Click **Advanced** → **Go to Apps Script (unsafe)** if Google warns the project is unverified
   - Click **Allow**
10. Wait for the run to complete (a green checkmark in the Execution Log).
11. Open **Triggers** (clock icon, left sidebar) — confirm 3 entries exist for `onChangeHandler`, `onEditHandler`, `onFormSubmitHandler`.
12. Add one test row to the `orders` sheet → confirm the OrderId auto-fills.

---

## Testing & Monitoring

### Testing Checklist (10 items)

- [ ] **1.** Run `setupTriggers()` manually — Execution Log shows success
- [ ] **2.** Confirm exactly 3 Aura Rental triggers in the Triggers list (no duplicates after a second run)
- [ ] **3.** Add a blank row to `orders` — `OrderId` auto-fills with `A00001`
- [ ] **4.** Add a second row — ID is `A00002` (no duplicates even when adding rapidly)
- [ ] **5.** Add a row to `payments` — `IsRefunded=TRUE` and `RefundedAt=<current time>` auto-fill
- [ ] **6.** Confirm payment snapshot columns (CustomerName, Package, dates, Amount) match the source order
- [ ] **7.** Set `PickupDate` > `ReturnDate` in `orders` — alert appears, edit reverted
- [ ] **8.** Set `IsDeleted=TRUE` on an existing `orders` row — matching `order_dresses` rows are also flagged
- [ ] **9.** Temporarily rename a sheet to break a handler — owner email arrives within 1 minute
- [ ] **10.** Restore the sheet name and confirm Execution Log shows the recovery (no further errors)

### Monitoring

- Open **Apps Script editor** → **Executions** (list icon, left sidebar) to review the run history
- Filter by status: **Failed** to see what broke
- For email notifications: **Triggers** → click any trigger → enable **Notifications** → **Email me daily** (recommended for the first week)

---

## Troubleshooting

### Error 1: "Authorization required" on first run

**Cause:** The script has not yet been granted access to Sheets, Script Properties, or Mail.

**Fix:**
1. Run any function manually (e.g. `setupTriggers`)
2. Click **Review Permissions** → choose your account
3. If Google warns "This app isn't verified", click **Advanced** → **Go to <project> (unsafe)** → **Allow**
4. Re-run the function

---

### Error 2: Lock wait timeout in `generateOrderId`

**Cause:** Another process is holding `LockService` for longer than 20 seconds (rare; usually means a previous run hung).

**Fix:**
1. Wait 30 seconds and retry
2. Open the **Executions** panel and cancel any in-flight run
3. If persistent, raise the timeout from `20000` to `30000` in `generateOrderId`
4. Check for runaway triggers — a trigger that calls itself can hold the lock indefinitely

---

### Error 3: Duplicate OrderId (e.g. two rows both = `A00017`)

**Cause:** Either `LockService` was bypassed, or the script property `AURA_ORDER_COUNTER` was reset.

**Fix:**
1. Open **File → Project Properties → Script Properties**
2. Confirm `AURA_ORDER_COUNTER` is set to the highest issued number (e.g. `17`)
3. If missing or lower, set it manually to `max(issued IDs) - 1`
4. Re-run `generateOrderId()` once to verify increment

---

### Error 4: `Cannot read property 'indexOf' of undefined`

**Cause:** A sheet is missing the expected header row, or a column name was renamed.

**Fix:**
1. Open the offending sheet (check Execution Log for sheet name)
2. Confirm row 1 contains the exact English header text from `CONFIG.COLUMNS` (case-sensitive)
3. Re-run the trigger

---

### Error 5: Emails not arriving to owner

**Cause:** Either `CONFIG.OWNER_EMAIL` is wrong, or the MailApp quota was exceeded (100 emails/day for free accounts).

**Fix:**
1. Verify `CONFIG.OWNER_EMAIL` in the constants block
2. Check spam / quarantine folders
3. Open **Executions** → look for "Failed to send error email" log lines
4. If quota-exceeded, throttle handlers or upgrade to a Workspace account

---

## Rollback Procedures

If any part of the script misbehaves, follow the steps below in order.

### Option A — Disable triggers (fastest)

1. Open **Apps Script** → **Triggers** (clock icon)
2. For each of the 3 Aura Rental triggers, click the three-dot menu → **Delete trigger**
3. The script will no longer run automatically; manual edits are unaffected

### Option B — Revert to a previous version

1. Open **Apps Script** → **File → Manage versions**
2. Select the last known-good version → click **Restore**
3. The editor reloads with the older code; triggers remain but now call the reverted code

### Option C — Full removal

1. Delete the file `AppsScript_AuraRental.gs` (right-click → **Delete**)
2. Open **Triggers** → delete the 3 Aura Rental triggers
3. The sheet returns to its pre-script state (all manual data preserved)

### Data cleanup (if OrderId counter is corrupted)

1. Open the `orders` sheet, identify the maximum existing OrderId number
2. **File → Project Properties → Script Properties**
3. Set `AURA_ORDER_COUNTER` to `max - 1` (e.g. if max is `A00017`, set counter to `17`)
4. Run `generateOrderId()` once — next call returns `A00018`

### After rollback

- Open the **Executions** panel and confirm no further errors
- Email the owner that the rollback is complete (if applicable)
- Update CHANGELOG.md with the rollback entry