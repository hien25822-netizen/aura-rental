/**
 * Aura Rental — Google Apps Script
 * File: AppsScript_AuraRental.gs
 *
 * Deploy: Google Sheets → Extensions → Apps Script → paste this file → Save.
 * Run setupTriggers() once to install triggers (authorize when prompted).
 *
 * Responsibilities:
 *   1. Auto-generate OrderId (A00001, A00002, ...) with LockService.
 *   2. Cascade soft-delete order_dresses rows when their parent order is removed.
 *   3. Auto-set IsRefunded + RefundedAt on orders when a new payment is logged.
 *   4. Auto-fill payment snapshots (DressRentalSnapshot, AccessoryRentalSnapshot).
 *   5. Validate ReturnDate >= PickupDate on orders edits.
 *   6. Email owner on any unhandled error.
 */

var CONFIG = {
  ORDERS_TAB:         'orders',
  ORDER_DRESSES_TAB:  'order_dresses',
  DRESSES_TAB:        'dresses',
  ACCESSORIES_TAB:    'accessories',
  PAYMENTS_TAB:       'payments',
  FORM_TAB:           'form_submissions',

  COL_ORDER_ID:           'OrderId',
  COL_ORDER_STATUS:       'OrderStatus',
  COL_CUSTOMER_INSTA:     'CustomerInsta',
  COL_CUSTOMER_PHONE:     'CustomerPhone',
  COL_ACCESSORY_IDS:      'AccessoryIds',
  COL_PACKAGE:            'Package',
  COL_PICKUP_DATE:        'PickupDate',
  COL_PICKUP_TIME:        'PickupTime',
  COL_RETURN_DATE:        'ReturnDate',
  COL_DEPOSIT_FORM:       'DepositForm',
  COL_RECEIVE_FORM:       'ReceiveForm',
  COL_ADDRESS:            'Address',
  COL_OTHER_COSTS:        'OtherCosts',
  COL_IS_REFUNDED:        'IsRefunded',
  COL_NOTE:               'Note',
  COL_REFUNDED_AT:        'RefundedAt',
  COL_CREATED_AT:         'CreatedAt',
  COL_TIMES_RENTED:       'TimesRented',

  COL_OD_ID:              'OrderDressId',
  COL_OD_ORDER_ID:        'OrderId',
  COL_OD_DRESS_ID:        'DressId',

  COL_DRESS_ID:           'DressId',
  COL_DRESS_NAME:         'DressName',
  COL_DRESS_SIZE:         'Size',
  COL_ORIGINAL_PRICE:     'OriginalPrice',
  COL_PRICE_12H:          'Price12h',
  COL_PRICE_1D:           'Price1d',
  COL_PRICE_3D:           'Price3d',

  COL_PAYMENT_ID:         'PaymentId',
  COL_PAYMENT_DATE:       'PaymentDate',
  COL_DEPOSIT_CASH:       'DepositCash',
  COL_DRESS_SNAPSHOT:     'DressRentalSnapshot',
  COL_ACC_SNAPSHOT:       'AccessoryRentalSnapshot',

  COUNTER_KEY: 'MAX_ORDER_ID'
};

var OWNER_EMAIL = 'phuong@aurarental.vn'; // <-- CHANGE to Phuong's real Gmail


/* ============================================================
 * TRIGGERS
 * ============================================================ */

function setupTriggers() {
  var ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function(t) {
    ScriptApp.deleteTrigger(t);
  });

  ScriptApp.newTrigger('onChangeHandler')
    .forSpreadsheet(ss)
    .onChange()
    .create();

  ScriptApp.newTrigger('onEditHandler')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  ScriptApp.newTrigger('onFormSubmitHandler')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  Logger.log('Aura Rental triggers installed: onChange + onEdit + onFormSubmit.');
}

function onChangeHandler(e) {
  try {
    var sheet = e.source.getActiveSheet();
    var name  = sheet.getName();
    if (name === CONFIG.ORDERS_TAB)    return handleOrdersChange(sheet, e);
    if (name === CONFIG.PAYMENTS_TAB)  return handlePaymentsChange(sheet, e);
    if (name === CONFIG.ORDER_DRESSES_TAB) return cascadeDeleteOrderDresses(sheet);
  } catch (err) {
    handleError(err, 'onChangeHandler');
  }
}

function onEditHandler(e) {
  try {
    var sheet = e.source.getActiveSheet();
    if (sheet.getName() !== CONFIG.ORDERS_TAB) return;
    validateReturnDate(e);
  } catch (err) {
    handleError(err, 'onEditHandler');
  }
}

function onFormSubmitHandler(e) {
  try {
    if (!e || !e.namedValues) return;
    Logger.log('Form submitted: ' + JSON.stringify(Object.keys(e.namedValues)));
  } catch (err) {
    handleError(err, 'onFormSubmitHandler');
  }
}


/* ============================================================
 * ORDER ID GENERATOR (LockService + atomic counter)
 * ============================================================ */

function generateOrderId() {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var props = PropertiesService.getScriptProperties();
    var maxNum = parseInt(props.getProperty(CONFIG.COUNTER_KEY) || '0', 10);
    if (isNaN(maxNum)) maxNum = 0;

    // Re-derive from sheet to handle counter drift / direct edits
    var sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.ORDERS_TAB);
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var vals = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      vals.forEach(function(r) {
        var m = String(r[0]).match(/^A(\d+)$/);
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      });
    }

    maxNum += 1;
    props.setProperty(CONFIG.COUNTER_KEY, String(maxNum));
    return 'A' + ('00000' + maxNum).slice(-5);
  } finally {
    lock.releaseLock();
  }
}


/* ============================================================
 * ORDERS CHANGE HANDLER
 * ============================================================ */

function handleOrdersChange(sheet, e) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = headerIndex(header);

  var orderIdCol  = idx[CONFIG.COL_ORDER_ID];
  var statusCol   = idx[CONFIG.COL_ORDER_STATUS];
  if (orderIdCol === undefined) return;

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

  data.forEach(function(row, i) {
    var rowNum = i + 2;
    var orderId   = String(row[orderIdCol] || '').trim();
    var status    = String(row[statusCol]   || '').trim();

    // Auto-fill OrderId for new rows
    if (!orderId) {
      var newId = generateOrderId();
      sheet.getRange(rowNum, orderIdCol + 1).setValue(newId);
      orderId = newId;
    }

    // When order is "Booked" (locked-in), increment TimesRented on related dresses
    if (status === 'Booked') {
      incrementTimesRented(orderId);
    }
  });

  // Soft-cascade delete: blank OrderId on order_dresses rows whose parent order is gone
  cascadeDeleteOrderDresses(sheet);
}

function incrementTimesRented(orderId) {
  var odSheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.ORDER_DRESSES_TAB);
  var drSheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.DRESSES_TAB);
  if (!odSheet || !drSheet) return;
  var odLast = odSheet.getLastRow();
  if (odLast < 2) return;

  var odData = odSheet.getRange(2, 1, odLast - 1, odSheet.getLastColumn()).getValues();
  var odHeader = odSheet.getRange(1, 1, 1, odSheet.getLastColumn()).getValues()[0];
  var odIdx = headerIndex(odHeader);
  var dressIds = {};
  odData.forEach(function(r) {
    if (String(r[odIdx[CONFIG.COL_OD_ORDER_ID]]).trim() === orderId) {
      var did = String(r[odIdx[CONFIG.COL_OD_DRESS_ID]]).trim();
      if (did) dressIds[did] = true;
    }
  });

  var drHeader = drSheet.getRange(1, 1, 1, drSheet.getLastColumn()).getValues()[0];
  var drIdx = headerIndex(drHeader);
  var dressIdCol = drIdx[CONFIG.COL_DRESS_ID];
  var timesCol   = drIdx[CONFIG.COL_TIMES_RENTED];
  if (dressIdCol === undefined || timesCol === undefined) return;

  var drLast = drSheet.getLastRow();
  if (drLast < 2) return;
  var drData = drSheet.getRange(2, 1, drLast - 1, drSheet.getLastColumn()).getValues();
  drData.forEach(function(r, i) {
    if (dressIds[String(r[dressIdCol]).trim()]) {
      var cur = parseInt(r[timesCol] || 0, 10) || 0;
      drSheet.getRange(i + 2, timesCol + 1).setValue(cur + 1);
    }
  });
}


/* ============================================================
 * CASCADE SOFT-DELETE
 * ============================================================ */

function cascadeDeleteOrderDresses(ordersSheet) {
  var odSheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.ORDER_DRESSES_TAB);
  if (!odSheet) return;

  var ordersLast = ordersSheet.getLastRow();
  var validIds = {};
  if (ordersLast >= 2) {
    var header = ordersSheet.getRange(1, 1, 1, ordersSheet.getLastColumn()).getValues()[0];
    var col = headerIndex(header)[CONFIG.COL_ORDER_ID];
    if (col !== undefined) {
      ordersSheet.getRange(2, col + 1, ordersLast - 1, 1).getValues().forEach(function(r) {
        if (r[0]) validIds[String(r[0]).trim()] = true;
      });
    }
  }

  var odLast = odSheet.getLastRow();
  if (odLast < 2) return;
  var odHeader = odSheet.getRange(1, 1, 1, odSheet.getLastColumn()).getValues()[0];
  var orderIdCol = headerIndex(odHeader)[CONFIG.COL_OD_ORDER_ID];
  if (orderIdCol === undefined) return;

  var odData = odSheet.getRange(2, 1, odLast - 1, odSheet.getLastColumn()).getValues();
  var rowsToClear = [];
  for (var i = 0; i < odData.length; i++) {
    var id = String(odData[i][orderIdCol] || '').trim();
    if (id && !validIds[id]) rowsToClear.push(i + 2);
  }
  rowsToClear.forEach(function(r) {
    odSheet.getRange(r, orderIdCol + 1).setValue('');
  });
}


/* ============================================================
 * PAYMENTS CHANGE HANDLER
 * ============================================================ */

function handlePaymentsChange(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = headerIndex(header);

  var paymentIdCol  = idx[CONFIG.COL_PAYMENT_ID];
  var orderIdCol    = idx[CONFIG.COL_ORDER_ID];
  var paymentDateCol = idx[CONFIG.COL_PAYMENT_DATE];
  var dressSnapCol  = idx[CONFIG.COL_DRESS_SNAPSHOT];
  var accSnapCol    = idx[CONFIG.COL_ACC_SNAPSHOT];
  if (orderIdCol === undefined) return;

  var data = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  data.forEach(function(row, i) {
    var rowNum = i + 2;
    var orderId = String(row[orderIdCol] || '').trim();
    if (!orderId) return;

    if (paymentDateCol !== undefined && !row[paymentDateCol]) {
      sheet.getRange(rowNum, paymentDateCol + 1).setValue(new Date());
    }

    if (dressSnapCol !== undefined && (row[dressSnapCol] === '' || row[dressSnapCol] === null)) {
      sheet.getRange(rowNum, dressSnapCol + 1).setValue(computeDressRentalTotal(orderId));
    }
    if (accSnapCol !== undefined && (row[accSnapCol] === '' || row[accSnapCol] === null)) {
      sheet.getRange(rowNum, accSnapCol + 1).setValue(computeAccessoryRentalTotal(orderId));
    }

    markOrderRefunded(orderId);
  });
}

function markOrderRefunded(orderId) {
  var ordersSheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.ORDERS_TAB);
  if (!ordersSheet) return;
  var last = ordersSheet.getLastRow();
  if (last < 2) return;
  var header = ordersSheet.getRange(1, 1, 1, ordersSheet.getLastColumn()).getValues()[0];
  var idx = headerIndex(header);
  var orderIdCol  = idx[CONFIG.COL_ORDER_ID];
  var isRefundedCol = idx[CONFIG.COL_IS_REFUNDED];
  var refundedAtCol = idx[CONFIG.COL_REFUNDED_AT];
  if (orderIdCol === undefined || isRefundedCol === undefined) return;

  var data = ordersSheet.getRange(2, 1, last - 1, ordersSheet.getLastColumn()).getValues();
  data.forEach(function(r, i) {
    if (String(r[orderIdCol]).trim() === orderId) {
      var rowNum = i + 2;
      if (!r[isRefundedCol]) ordersSheet.getRange(rowNum, isRefundedCol + 1).setValue(true);
      if (refundedAtCol !== undefined && !r[refundedAtCol]) {
        ordersSheet.getRange(rowNum, refundedAtCol + 1).setValue(new Date());
      }
    }
  });
}


/* ============================================================
 * SNAPSHOT COMPUTATIONS
 * ============================================================ */

function computeDressRentalTotal(orderId) {
  var ordersSheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.ORDERS_TAB);
  if (!ordersSheet) return 0;
  var orderRow = findRow(ordersSheet, CONFIG.COL_ORDER_ID, orderId);
  if (!orderRow) return 0;
  var pkg = orderRow.values[headerIndex(orderRow.header)[CONFIG.COL_PACKAGE]];
  var priceCol = packageToPriceCol(pkg);
  if (!priceCol) return 0;

  var drSheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.DRESSES_TAB);
  if (!drSheet) return 0;
  var drHeader = drSheet.getRange(1, 1, 1, drSheet.getLastColumn()).getValues()[0];
  var drIdx = headerIndex(drHeader);
  var dressIdCol = drIdx[CONFIG.COL_DRESS_ID];
  var targetCol  = drIdx[priceCol];
  if (dressIdCol === undefined || targetCol === undefined) return 0;

  var prices = {};
  drSheet.getRange(2, 1, drSheet.getLastRow() - 1, drSheet.getLastColumn()).getValues().forEach(function(r) {
    prices[String(r[dressIdCol]).trim()] = Number(r[targetCol] || 0);
  });

  var odSheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.ORDER_DRESSES_TAB);
  if (!odSheet) return 0;
  var odHeader = odSheet.getRange(1, 1, 1, odSheet.getLastColumn()).getValues()[0];
  var odIdx = headerIndex(odHeader);
  var odOrderIdCol = odIdx[CONFIG.COL_OD_ORDER_ID];
  var odDressIdCol = odIdx[CONFIG.COL_OD_DRESS_ID];
  if (odOrderIdCol === undefined || odDressIdCol === undefined) return 0;

  var total = 0;
  odSheet.getRange(2, 1, odSheet.getLastRow() - 1, odSheet.getLastColumn()).getValues().forEach(function(r) {
    if (String(r[odOrderIdCol]).trim() === orderId && r[odDressIdCol]) {
      total += prices[String(r[odDressIdCol]).trim()] || 0;
    }
  });
  return total;
}

function computeAccessoryRentalTotal(orderId) {
  var ordersSheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.ORDERS_TAB);
  if (!ordersSheet) return 0;
  var orderRow = findRow(ordersSheet, CONFIG.COL_ORDER_ID, orderId);
  if (!orderRow) return 0;
  var pkg = orderRow.values[headerIndex(orderRow.header)[CONFIG.COL_PACKAGE]];
  var priceCol = packageToPriceCol(pkg);
  if (!priceCol) return 0;

  var accSheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.ACCESSORIES_TAB);
  if (!accSheet) return 0;
  var accHeader = accSheet.getRange(1, 1, 1, accSheet.getLastColumn()).getValues()[0];
  var accIdx = headerIndex(accHeader);
  var accIdCol = accIdx['AccessoryId'];
  var targetCol = accIdx[priceCol];
  if (accIdCol === undefined || targetCol === undefined) return 0;

  var prices = {};
  accSheet.getRange(2, 1, accSheet.getLastRow() - 1, accSheet.getLastColumn()).getValues().forEach(function(r) {
    prices[String(r[accIdCol]).trim()] = Number(r[targetCol] || 0);
  });

  var accessoryIdsCell = orderRow.values[headerIndex(orderRow.header)[CONFIG.COL_ACCESSORY_IDS]];
  if (!accessoryIdsCell) return 0;
  var ids = String(accessoryIdsCell).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
  var total = 0;
  ids.forEach(function(id) { total += prices[id] || 0; });
  return total;
}


/* ============================================================
 * VALIDATION
 * ============================================================ */

function validateReturnDate(e) {
  var sheet = e.source.getActiveSheet();
  var row = e.range.getRow();
  if (row < 2) return;
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = headerIndex(header);
  var pickupCol = idx[CONFIG.COL_PICKUP_DATE];
  var returnCol = idx[CONFIG.COL_RETURN_DATE];
  if (pickupCol === undefined || returnCol === undefined) return;

  var pickup = sheet.getRange(row, pickupCol + 1).getValue();
  var ret    = sheet.getRange(row, returnCol + 1).getValue();
  if (pickup && ret && new Date(ret) < new Date(pickup)) {
    SpreadsheetApp.getUi().alert('ReturnDate must be >= PickupDate. Reset to PickupDate.');
    sheet.getRange(row, returnCol + 1).setValue(pickup);
  }
}


/* ============================================================
 * UTILITIES
 * ============================================================ */

function headerIndex(header) {
  var idx = {};
  header.forEach(function(h, i) { idx[h] = i; });
  return idx;
}

function findRow(sheet, keyCol, keyVal) {
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var col = headerIndex(header)[keyCol];
  if (col === undefined) return null;
  var data = sheet.getRange(2, col + 1, last - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(keyVal).trim()) {
      var rowVals = sheet.getRange(i + 2, 1, 1, sheet.getLastColumn()).getValues()[0];
      return { rowNum: i + 2, values: rowVals, header: header };
    }
  }
  return null;
}

function packageToPriceCol(pkg) {
  if (pkg === '12h')    return CONFIG.COL_PRICE_12H;
  if (pkg === '1 day')  return CONFIG.COL_PRICE_1D;
  if (pkg === '3 days') return CONFIG.COL_PRICE_3D;
  return null;
}

function handleError(err, fn) {
  var msg = '[AuraRental] Error in ' + fn + ': ' + (err && err.message ? err.message : err);
  Logger.log(msg);
  try {
    MailApp.sendEmail(OWNER_EMAIL, '[Aura Rental] Apps Script Error', msg);
  } catch (mailErr) {
    Logger.log('Failed to email owner: ' + mailErr);
  }
}


/* ============================================================
 * BOOTSTRAP HELPERS (run once on fresh setup)
 * ============================================================ */

function resetOrderIdCounter() {
  PropertiesService.getScriptProperties().deleteProperty(CONFIG.COUNTER_KEY);
  Logger.log('Counter reset. Next OrderId will be A00001.');
}

function initHeaders() {
  var headers = {
    'orders': [
      'OrderId', 'OrderStatus', 'CustomerInsta', 'CustomerPhone',
      'AccessoryIds', 'Package', 'PickupDate', 'PickupTime', 'ReturnDate',
      'DepositForm', 'ReceiveForm', 'Address', 'OtherCosts',
      'IsRefunded', 'Note', 'RefundedAt', 'CreatedAt'
    ],
    'order_dresses': ['OrderDressId', 'OrderId', 'DressId'],
    'dresses': [
      'DressId', 'DressName', 'Size', 'OriginalPrice',
      'Price12h', 'Price1d', 'Price3d', 'ImageUrl', 'Note', 'TimesRented'
    ],
    'accessories': [
      'AccessoryId', 'AccessoryName', 'Type', 'TotalQty',
      'Price12h', 'Price1d', 'Price3d', 'ImageUrl', 'Note'
    ],
    'payments': [
      'PaymentId', 'PaymentDate', 'OrderId', 'DepositCash', 'OtherCosts',
      'Note', 'DressRentalSnapshot', 'AccessoryRentalSnapshot'
    ],
    'availability_checks': [
      'CheckId', 'CheckType', 'ItemId', 'CheckDate', 'Package'
    ],
    'form_submissions': [
      'SubmissionId', 'Timestamp', 'CustomerInsta', 'CustomerPhone',
      'DressPlusSize', 'Accessories', 'Package', 'PickupDate', 'PickupTime',
      'ReceiveForm', 'Address', 'DepositForm', 'Event',
      'OrderId', 'CreatedAt', 'Status', 'StaffNote'
    ]
  };
  var ss = SpreadsheetApp.getActive();
  Object.keys(headers).forEach(function(name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers[name].length).setValues([headers[name]]);
    sh.setFrozenRows(1);
  });
}
