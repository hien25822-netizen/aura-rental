# Google Sheets Formulas

**Project:** Aura Rental
**Last Updated:** 2026-06-27

---

## ⚠️ EXPERIMENTAL - TESTING IN PROGRESS

**Feature:** Schema-Driven Refund Flow with Calendar Status & Auto-Deref
**Status:** ⚠ EXPERIMENTAL - NOT YET DEPLOYED
**Started:** 2026-06-27
**Purpose:** Document the underlying Google Sheets schema (7-tab layout, column types/formats, frozen header row, VND currency rules) that backs the AppSheet Aura Rental system. This file is the source of truth for column-level sheet definitions; formulas and virtual-column derivations live in `appsheet_formulas.md`.

### What's New

- 7 tabs (snake_case): orders, order_dresses, payments, dresses, accessories, availability_checks, form_submissions
- Tab-to-tab relationships preserved via OrderId, DressId, AccessoryId, CheckId, SubmissionId primary keys
- Frozen row 1 (header row) on every tab for stable scrolling
- VND currency formatting: symbol `đ`, comma separator, no decimals (e.g., `1,200,000 đ`)
- Date columns stored as native Google Sheets date values (yyyy-MM-dd); timestamps as datetime (yyyy-MM-dd HH:mm:ss)

### Changes Summary

**New tabs:** orders, order_dresses, dresses, accessories, payments, availability_checks, form_submissions
**New format rules (sheet-level):**
- All tabs: freeze row 1, bold header, light-gray fill
- Currency cells: `#,##0" đ"` custom format
- Date cells: `yyyy-MM-dd`
- Datetime cells: `yyyy-MM-dd HH:mm:ss`
- ID columns: plain text (left-aligned) to prevent numeric coercion

**Schema conventions:**
- snake_case for tab names
- PascalCase for column headers
- Primary keys suffixed with `Id` (OrderId, DressId, PaymentId, etc.)
- Foreign keys match referenced primary key (OrderId in `order_dresses` references `orders.OrderId`)
- Snapshot columns on `payments` (DressRentalSnapshot, AccessoryRentalSnapshot) store comma-separated dress/accessory identifiers at payment time

### Implementation Steps

1. Create the 7 Google Sheets tabs in declared order
2. Apply frozen row 1 and header bold/fill across all tabs
3. Apply currency `#,##0" đ"` format to monetary columns
4. Apply date/datetime formats to date columns
5. Set ID columns as plain text (Format → Number → Plain text) before paste
6. Connect AppSheet to this spreadsheet (see `appsheet_formulas.md` for app-side rules)

### Testing Checklist

- [ ] All 7 tabs present with snake_case names
- [ ] Row 1 frozen on every tab
- [ ] Currency cells render as e.g., `1,200,000 đ` (comma separator, đ suffix, no decimals)
- [ ] Dates render as `yyyy-MM-dd`
- [ ] Timestamps render as `yyyy-MM-dd HH:mm:ss`
- [ ] ID columns remain left-aligned and not coerced to numbers
- [ ] `orders.AccessoryIds` accepts comma-separated AccessoryId values
- [ ] `order_dresses` correctly references `orders.OrderId` and `dresses.DressId`
- [ ] `payments.DressRentalSnapshot` and `AccessoryRentalSnapshot` capture point-in-time rental line items

### Rollback Instructions

1. Archive this `docs/formulas/googlesheet_formulas.md` to `backups/2026-06-27-experimental-v1/`
2. Revert to last STABLE V0 (empty placeholder)
3. Disconnect AppSheet data source
4. Manually delete the 7 Google Sheets tabs

---

## ✅ STABLE SYSTEM

**Version:** V1
**Last Updated:** 2026-06-27

---

## 📋 TABLE OF CONTENTS

1. [System Overview](#-system-overview)
2. [Sheet Conventions](#-sheet-conventions)
3. [Tab 1: orders](#1-orders)
4. [Tab 2: order_dresses](#2-order_dresses)
5. [Tab 3: dresses](#3-dresses)
6. [Tab 4: accessories](#4-accessories)
7. [Tab 5: payments](#5-payments)
8. [Tab 6: availability_checks](#6-availability_checks)
9. [Tab 7: form_submissions](#7-form_submissions)
10. [Formula Patterns](#-formula-patterns)
11. [Cross-Tab Dependencies](#-cross-tab-dependencies)

---

## 📋 SYSTEM OVERVIEW

**Key Features:**
- **orders tab:** Single source of truth for every rental transaction; tracks customer, package, pickup/return dates, deposit forms, and refund state
- **order_dresses tab:** Join table linking orders to dresses (many-to-many resolved as one-to-many per order)
- **dresses tab:** Inventory master with 3 pricing tiers (12h / 1d / 3d) and rental counter
- **accessories tab:** Auxiliary rental items (shoes, bags, jewelry) with per-tier pricing and total stock
- **payments tab:** Deposit and refund ledger with point-in-time snapshots of rental line items
- **availability_checks tab:** Calendar-driven reservation probes by item and date
- **form_submissions tab:** Customer-facing intake form responses, linked to orders once processed

---

## 📋 SHEET CONVENTIONS

### Frozen Row
- **Row 1 is frozen on every tab.**
- Header text is bold with light-gray fill (`#EFEFEF`).
- Header row never scrolls.

### Currency (VND)
- All monetary values are VND (Vietnamese Dong).
- Custom number format: `#,##0" đ"`
- Symbol: `đ` (lowercase d with stroke, U+0111)
- Thousands separator: comma
- No decimals (VND has no sub-unit)
- Examples:
  - `1200000` → `1,200,000 đ`
  - `500000` → `500,000 đ`

### Date / Datetime
- Dates: `yyyy-MM-dd` (e.g., `2026-06-27`)
- Datetimes: `yyyy-MM-dd HH:mm:ss` (e.g., `2026-06-27 14:30:00`)

### IDs
- Primary keys suffixed with `Id`.
- Format column as **Plain text** before paste to prevent numeric coercion.
- Left-aligned, monospace-friendly.

---

## 1. orders

**Purpose:** Master record for each rental transaction.

**Sheet:** `orders`
**Primary Key:** `OrderId`
**Frozen Row:** 1

| Column | Type | Format | Notes |
|--------|------|--------|-------|
| OrderId | Text | Plain text | Primary key, e.g., `ORD-20260627-001` |
| OrderStatus | Text | Plain text | Enum: Pending / Confirmed / Preparing / CurrentlyRenting / Returning / Overdue / Completed / Cancelled |
| CustomerInsta | Text | Plain text | Instagram handle without `@` |
| CustomerPhone | Text | Plain text | E.164 or local VN format |
| AccessoryIds | Text | Plain text | Comma-separated `AccessoryId` list (e.g., `ACC-001,ACC-003`) |
| Package | Text | Plain text | Enum: `12h` / `1d` / `3d` |
| PickupDate | Date | `yyyy-MM-dd` | Customer pickup date |
| PickupTime | Text | Plain text | Local time, e.g., `14:00` |
| ReturnDate | Date | `yyyy-MM-dd` | Computed or manual return date |
| DepositForm | Text | Plain text | Enum: `50%` / `100%` |
| ReceiveForm | Text | Plain text | Enum: `Cash` / `Transfer` / `Card` |
| Address | Text | Plain text | Free-form delivery/pickup address |
| OtherCosts | Number | `#,##0" đ"` | Shipping, cleaning, late fees (VND) |
| IsRefunded | Boolean | TRUE / FALSE | Refund state flag |
| Note | Text | Plain text | Free-form staff note |
| RefundedAt | Datetime | `yyyy-MM-dd HH:mm:ss` | Timestamp when refund completed |
| CreatedAt | Datetime | `yyyy-MM-dd HH:mm:ss` | Row creation timestamp |

**Example Row:**
```
| ORD-20260627-001 | Confirmed    | aura.vn      | 0901234567 | ACC-001     | 1d    | 2026-06-28 | 10:00 | 2026-06-29 | 50%    | Cash     | 12 Le Loi, Q1     |    50000 đ | FALSE    | First-time customer        |                  | 2026-06-27 09:15:00 |
```

---

## 2. order_dresses

**Purpose:** Resolves the many-to-many relationship between orders and dresses.

**Sheet:** `order_dresses`
**Primary Key:** `OrderDressId`
**Frozen Row:** 1

| Column | Type | Format | Notes |
|--------|------|--------|-------|
| OrderDressId | Text | Plain text | Primary key, e.g., `ODR-20260627-001` |
| OrderId | Text | Plain text | Foreign key → `orders.OrderId` |
| DressId | Text | Plain text | Foreign key → `dresses.DressId` |

**Example Row:**
```
| ODR-20260627-001 | ORD-20260627-001 | DRESS-001 |
```

**Notes:**
- One order can have multiple rows (one per dress in the order).
- No currency columns on this tab; rental fee derivation lives in AppSheet virtual columns (see `appsheet_formulas.md`).

---

## 3. dresses

**Purpose:** Inventory master for dresses with per-package pricing.

**Sheet:** `dresses`
**Primary Key:** `DressId`
**Frozen Row:** 1

| Column | Type | Format | Notes |
|--------|------|--------|-------|
| DressId | Text | Plain text | Primary key, e.g., `DRESS-001` |
| DressName | Text | Plain text | Display name |
| Size | Text | Plain text | Enum: `XS` / `S` / `M` / `L` / `XL` / `XXL` / `Free Size` |
| OriginalPrice | Number | `#,##0" đ"` | Retail price (VND) |
| Price12h | Number | `#,##0" đ"` | 12-hour rental price (VND) |
| Price1d | Number | `#,##0" đ"` | 1-day rental price (VND) |
| Price3d | Number | `#,##0" đ"` | 3-day rental price (VND) |
| ImageUrl | Text | Plain text | URL to image (Google Drive, CDN, etc.) |
| Note | Text | Plain text | Care notes, fit notes, restrictions |
| TimesRented | Number | Integer | Running count of rentals (auto-increment via AppSheet) |

**Example Row:**
```
| DRESS-001 | Aurora Beaded Gown | M    | 8,500,000 đ | 1,200,000 đ | 2,000,000 đ | 4,500,000 đ | https://drive.google.com/.../aurora.jpg | Hand-wash only        |          12 |
```

---

## 4. accessories

**Purpose:** Auxiliary rental items (shoes, bags, jewelry, etc.).

**Sheet:** `accessories`
**Primary Key:** `AccessoryId`
**Frozen Row:** 1

| Column | Type | Format | Notes |
|--------|------|--------|-------|
| AccessoryId | Text | Plain text | Primary key, e.g., `ACC-001` |
| AccessoryName | Text | Plain text | Display name |
| Type | Text | Plain text | Enum: `Shoes` / `Bag` / `Jewelry` / `Veil` / `Crown` / `Other` |
| TotalQty | Number | Integer | Physical stock count |
| Price12h | Number | `#,##0" đ"` | 12-hour rental price (VND) |
| Price1d | Number | `#,##0" đ"` | 1-day rental price (VND) |
| Price3d | Number | `#,##0" đ"` | 3-day rental price (VND) |
| ImageUrl | Text | Plain text | URL to image |
| Note | Text | Plain text | Care notes, sizing notes |

**Example Row:**
```
| ACC-001 | Crystal Hairpin | Jewelry |    8 | 150,000 đ | 250,000 đ | 500,000 đ | https://drive.google.com/.../pin.jpg | Delicate, avoid water |
```

---

## 5. payments

**Purpose:** Deposit and refund ledger with point-in-time snapshots.

**Sheet:** `payments`
**Primary Key:** `PaymentId`
**Frozen Row:** 1

| Column | Type | Format | Notes |
|--------|------|--------|-------|
| PaymentId | Text | Plain text | Primary key, e.g., `PAY-20260627-001` |
| PaymentDate | Datetime | `yyyy-MM-dd HH:mm:ss` | When payment was received |
| OrderId | Text | Plain text | Foreign key → `orders.OrderId` |
| DepositCash | Number | `#,##0" đ"` | Cash deposit amount (VND) |
| OtherCosts | Number | `#,##0" đ"` | Other charges (shipping, cleaning, etc.) (VND) |
| Note | Text | Plain text | Free-form note |
| DressRentalSnapshot | Text | Plain text | Frozen dress rental line items at payment time, e.g., `DRESS-001 x1 @ 2,000,000 đ` |
| AccessoryRentalSnapshot | Text | Plain text | Frozen accessory rental line items at payment time, e.g., `ACC-001 x1 @ 250,000 đ` |

**Example Row:**
```
| PAY-20260627-001 | 2026-06-27 09:15:00 | ORD-20260627-001 | 1,000,000 đ |    50,000 đ | 50% deposit, cash | DRESS-001 x1 @ 2,000,000 đ | ACC-001 x1 @ 250,000 đ |
```

**Notes:**
- Snapshots are immutable copies of rental pricing at the moment the payment was recorded.
- Even if `dresses.Price1d` later changes, the snapshot preserves historical accuracy.

---

## 6. availability_checks

**Purpose:** Calendar-driven reservation probes; verifies that a specific dress or accessory is free for a given date and package.

**Sheet:** `availability_checks`
**Primary Key:** `CheckId`
**Frozen Row:** 1

| Column | Type | Format | Notes |
|--------|------|--------|-------|
| CheckId | Text | Plain text | Primary key, e.g., `CHK-20260627-001` |
| CheckType | Text | Plain text | Enum: `Dress` / `Accessory` |
| ItemId | Text | Plain text | Foreign key → `dresses.DressId` or `accessories.AccessoryId` |
| CheckDate | Date | `yyyy-MM-dd` | Date being probed |
| Package | Text | Plain text | Enum: `12h` / `1d` / `3d` |

**Example Row:**
```
| CHK-20260627-001 | Dress      | DRESS-001 | 2026-06-28 | 1d   |
```

**Notes:**
- Acts as a scratch / cache table for AppSheet availability lookups.
- One row per (ItemId, CheckDate, Package) probe; can be cleared periodically.

---

## 7. form_submissions

**Purpose:** Customer-facing intake form responses; raw submissions before staff converts them into orders.

**Sheet:** `form_submissions`
**Primary Key:** `SubmissionId`
**Frozen Row:** 1

| Column | Type | Format | Notes |
|--------|------|--------|-------|
| SubmissionId | Text | Plain text | Primary key, e.g., `SUB-20260627-001` |
| Timestamp | Datetime | `yyyy-MM-dd HH:mm:ss` | Form submission time |
| CustomerInsta | Text | Plain text | Instagram handle |
| CustomerPhone | Text | Plain text | Phone number |
| DressPlusSize | Text | Plain text | Dress + size entered by customer, free-form |
| Accessories | Text | Plain text | Free-form accessories list |
| Package | Text | Plain text | Enum: `12h` / `1d` / `3d` |
| PickupDate | Date | `yyyy-MM-dd` | Requested pickup date |
| PickupTime | Text | Plain text | Requested pickup time, e.g., `14:00` |
| ReceiveForm | Text | Plain text | Enum: `Cash` / `Transfer` / `Card` |
| Address | Text | Plain text | Delivery/pickup address |
| DepositForm | Text | Plain text | Enum: `50%` / `100%` |
| Event | Text | Plain text | Event type, e.g., `Wedding`, `Photoshoot` |
| OrderId | Text | Plain text | Linked `orders.OrderId` once processed (blank before) |
| CreatedAt | Datetime | `yyyy-MM-dd HH:mm:ss` | Backend record creation time |
| Status | Text | Plain text | Enum: `New` / `In Review` / `Converted` / `Rejected` |
| StaffNote | Text | Plain text | Internal staff note |

**Example Row:**
```
| SUB-20260627-001 | 2026-06-27 08:42:11 | aura.vn      | 0901234567 | Aurora Beaded Gown / M | Crystal Hairpin  | 1d    | 2026-06-28 | 10:00 | Cash     | 12 Le Loi, Q1   | 50%    | Wedding   | ORD-20260627-001 | 2026-06-27 08:42:11 | Converted | VIP customer, prioritize |
```

---

## 📋 FORMULA PATTERNS

The Aura Rental Google Sheets workbook uses minimal in-sheet formulas; most derivations live in AppSheet virtual columns (see `appsheet_formulas.md`). The patterns below cover the few formulas that exist on the sheet itself.

### Pattern 1: ARRAYFORMULA — Auto-Increment Counter (dresses.TimesRented)

**Purpose:** Increment rental count when a new order_dresses row references this dress.

**Formula Location:** `dresses`!J:J
**Type:** ARRAYFORMULA with COUNTIFS
**Trigger:** Populates when a new row is added to `order_dresses`

**Formula:**
```excel
=ARRAYFORMULA(
    IF(
        ROW(A:A)=1,
        "TimesRented",
        IF(
            ISBLANK(A:A),
            "",
            COUNTIFS('order_dresses'!C:C, A:A)
        )
    )
)
```

**How It Works:**
1. **Header Row:** Displays `TimesRented`.
2. **Blank Check:** Returns empty if `DressId` (Column A) is blank.
3. **COUNTIFS:** Counts rows in `order_dresses` where `DressId` matches.

**Dependencies:**
- Requires: `order_dresses` Column C (`DressId`)
- Updates: Automatically when `order_dresses` changes

---

### Pattern 2: VLOOKUP — Dress Price Lookup (helper column on order_dresses)

**Purpose:** Pull the per-package dress price at order time into a sheet-side helper column (AppSheet virtual columns override this in production).

**Formula Location:** `order_dresses`!D:D
**Type:** VLOOKUP
**Trigger:** Populates when `DressId` (Column C) is filled

**Formula:**
```excel
=ARRAYFORMULA(
    IF(
        ROW(C:C)=1,
        "PriceLookup",
        IF(
            ISBLANK(C:C),
            "",
            IFERROR(
                IFS(
                    'orders'!F:F="12h", VLOOKUP(C:C, dresses!A:F, 4, FALSE),
                    'orders'!F:F="1d",  VLOOKUP(C:C, dresses!A:F, 5, FALSE),
                    'orders'!F:F="3d",  VLOOKUP(C:C, dresses!A:F, 6, FALSE)
                ),
                "Not Found"
            )
        )
    )
)
```

**How It Works:**
1. **Header Row:** Displays `PriceLookup`.
2. **Blank Check:** Returns empty if `DressId` is blank.
3. **Package Switch:** Selects the correct price column from `dresses` based on `orders.Package`.
4. **IFERROR:** Returns `Not Found` if dress is missing.

**Dependencies:**
- Requires: `order_dresses` Column C (`DressId`), `orders` Column F (`Package`)
- Requires: `dresses` tab columns A:F (`DressId`, `DressName`, `Size`, `OriginalPrice`, `Price12h`, `Price1d`)

---

### Pattern 3: QUERY — Availability Probe Summary

**Purpose:** Surface upcoming availability checks for a specific dress or accessory.

**Formula Location:** `availability_checks`!F1
**Type:** QUERY
**Trigger:** Automatic

**Formula:**
```excel
=QUERY(availability_checks!A:E,
    "SELECT A, B, C, D, E WHERE D >= date '" & TEXT(TODAY(), "yyyy-MM-dd") & "' ORDER BY D ASC",
    1)
```

**How It Works:**
1. **Data Source:** Pulls all rows from `availability_checks`.
2. **Filter:** `WHERE D >= today` shows only future probes.
3. **Sort:** `ORDER BY D ASC` lists soonest first.
4. **Headers:** `1` keeps row 1 as header.

---

## 📋 CROSS-TAB DEPENDENCIES

### Foreign-Key Relationships

| Child Tab | Child Column | Parent Tab | Parent Column | Cardinality |
|-----------|--------------|------------|---------------|-------------|
| order_dresses | OrderId | orders | OrderId | many-to-one |
| order_dresses | DressId | dresses | DressId | many-to-one |
| payments | OrderId | orders | OrderId | many-to-one |
| form_submissions | OrderId | orders | OrderId | many-to-one (optional until converted) |
| availability_checks | ItemId | dresses or accessories | DressId / AccessoryId | many-to-one |

### Snapshot Columns (Immutability)

| Snapshot Column | Parent Tab | Captured At |
|-----------------|------------|-------------|
| payments.DressRentalSnapshot | dresses | Payment record creation |
| payments.AccessoryRentalSnapshot | accessories | Payment record creation |

Snapshots are written at payment time and never updated, even if `dresses.Price1d` or `accessories.Price1d` later change.

### Update Order

When processing a new rental:
1. Insert row into `form_submissions` (raw intake)
2. Staff converts submission → insert into `orders` with new `OrderId`
3. Backfill `form_submissions.OrderId` and flip `Status` to `Converted`
4. Insert one row per dress into `order_dresses`
5. Insert deposit row into `payments` with snapshots populated
6. (Optional) Insert probe rows into `availability_checks`

---

**Version:** 1.0
**Last Updated:** 2026-06-27
**Source:** googlesheet-blueprint-skill/TEMPLATES.md