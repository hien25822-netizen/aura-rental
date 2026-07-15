# AppSheet Formulas

**Project:** Aura Rental
**Last Updated:** 2026-06-27

---

## ⚠️ EXPERIMENTAL - TESTING IN PROGRESS

**Feature:** Schema-Driven Refund Flow with Calendar Status & Auto-Deref
**Status:** ⚠ EXPERIMENTAL - NOT YET DEPLOYED
**Started:** 2026-06-27
**Purpose:** Build a 7-table dress rental system with auto-derived dress/accessory costs per order, calendar-driven rental lifecycle (Preparing / CurrentlyRenting / Returning / Overdue / Upcoming), and a single-screen refund workflow that auto-computes SuggestedDeposit and RefundAmount.

### What's New

- 7 interconnected tables (orders, order_dresses, payments, dresses, accessories, customers, dress_categories)
- Per-dress package-aware pricing (Price12h / Price1d / Price3d) derived into order_dresses.DressRentalFee
- Calendar status engine driven by [PickupDate], [Package], and computed [ActualReturnDate]
- Auto-deref rule from payments → orders for CustomerName, Package, PickupDate, ActualReturnDate, DepositForm, TotalOriginalPrice
- Single-tap refund form with SuggestedDeposit (50% or 100%) and RefundAmount = DepositCash − TotalRental − OtherCosts
- CustomerMessage auto-builder with negative-refund warning

### Changes Summary

**New tables:** orders, order_dresses, payments, dresses, accessories, customers, dress_categories
**New slices (5):** ActiveOrders, MonthCalendarOrders, PreparingOrders, RentingOrders, ReturningOrders
**New views (9):** Calendar, Orders, OrderDetail, RefundDeposit, CashLedger, Dresses, DressDetail, Accessories, AccessoryDetail
**New actions (3):** OpenOrderFromCalendar, NewOrderFromDress, ProcessRefund
**New format rules (5 colors):** Preparing, CurrentlyRenting, Returning, Overdue, Upcoming
**New enums (3):** Package, DepositForm, CalendarStatus

### Implementation Steps

1. Create Google Sheets tabs matching the 7 tables with columns in declared order
2. Create AppSheet app from Google Sheets, set primary keys
3. Add Enum values (Package, DepositForm, CalendarStatus)
4. Build physical columns per spec (orders.Package uses Enum, etc.)
5. Build virtual columns per spec (orders.DressCount, TotalOriginalPrice, ActualReturnDate, IsRefunded, CalendarStatus, CustomerAvatar)
6. Build order_dresses virtual columns (OriginalPriceOfDress, DressRentalFee)
7. Build payments virtual columns (CustomerName, Package, PickupDate, ActualReturnDate, DepositForm, DressRentalTotal, AccessoryRentalTotal, TotalRental, SuggestedDeposit, RefundAmount, CustomerMessage)
8. Build 5 slices
9. Build 9 views
10. Build 3 actions
11. Apply 5 calendar format rules

### Testing Checklist

- [ ] New order with Package="1 day" computes ActualReturnDate = PickupDate + 1
- [ ] DressRentalFee in order_dresses pulls correct price tier from dresses table
- [ ] Calendar shows Preparing on pickup day, CurrentlyRenting during rental, Returning on return day, Overdue past return
- [ ] RefundDeposit form auto-fills SuggestedDeposit based on DepositForm
- [ ] RefundAmount goes negative only when OtherCosts exceed Deposit (warning surfaces in CustomerMessage)
- [ ] ProcessRefund action navigates from OrderDetail to RefundDeposit with OrderId pre-filled
- [ ] NewOrderFromDress action passes DressId from DressDetail into the new order form

### Rollback Instructions

1. Archive this `docs/formulas/appsheet_formulas.md` to `backups/2026-06-27-experimental-v1/`
2. Revert `docs/formulas/appsheet_formulas.md` to last STABLE V0 (empty placeholder)
3. Delete AppSheet app or disconnect all 7 tables
4. Drop the 7 Google Sheets tabs

---

## ✅ STABLE SYSTEM

**Version:** V0
**Last Updated:** 2026-06-27

---

## 📋 TABLE OF CONTENTS

1. [System Overview](#-system-overview)
2. [All Table Schemas](#-all-table-schemas)
   - [Table 1: orders](#1-orders-table)
   - [Table 2: order_dresses](#2-order_dresses-table)
   - [Table 3: payments](#3-payments-table)
   - [Table 4: dresses](#4-dresses-table)
   - [Table 5: accessories](#5-accessories-table)
   - [Table 6: customers](#6-customers-table)
   - [Table 7: dress_categories](#7-dress_categories-table)
3. [All Enums](#-all-enums)
4. [All Slices](#-all-slices)
5. [All Views](#-all-views)
6. [All Actions](#-all-actions)
7. [All Format Rules](#-all-format-rules)

---

## 📋 SYSTEM OVERVIEW

**Key Features:**
- **orders table:** Single source of truth for every rental transaction; computes lifecycle status via virtual columns
- **order_dresses table:** Join table linking orders to dresses; auto-derives OriginalPriceOfDress and DressRentalFee from dresses table by package tier
- **payments table:** Deposit and refund ledger; auto-derives customer/order context and computes SuggestedDeposit, RefundAmount, CustomerMessage
- **dresses table:** Inventory master with 3 pricing tiers (12h / 1d / 3d) and image gallery
- **accessories table:** Auxiliary rental items (shoes, bags, jewelry) priced per day; many-to-many via payments.AccessoryIds
- **customers table:** Repeat-customer lookup keyed by Instagram handle
- **dress_categories table:** Categorization layer for dresses (e.g., Cocktail, Wedding, Vintage)

---

## 📋 ALL TABLE SCHEMAS

### 1. orders Table

**Google Sheets:** "orders" tab
**AppSheet Table Name:** orders
**Primary Key:** OrderId

**Table-Level Settings:**

```appsheet
Table: orders
  # Table-Level Operations
  Updates Enabled: Yes
  Adds Enabled: Yes
  Deletes Enabled: No

  # Row-Level Security Filter
  Security Filter (row-level): TRUE
```

**Columns:**

---

**Column A: OrderId**

```appsheet
Google Sheets: Column A, Type: Text
AppSheet Configuration:
  Column Name: OrderId
  Type: Text
  Key: Yes
  Initial Value: UNIQUEID()
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Unique identifier for every rental order. Auto-generated by UNIQUEID() at creation."
```

---

**Column B: CustomerInsta**

```appsheet
Google Sheets: Column B, Type: Text
AppSheet Configuration:
  Column Name: CustomerInsta
  Type: Text
  Key: No
  Initial Value: ""
  App Formula: N/A
  VALID_IF: NOT(ISBLANK([_THIS]))
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Customer's Instagram handle. Acts as the soft foreign key to customers.CustomerInsta. Required at order creation."
```

---

**Column C: CustomerPhone**

```appsheet
Google Sheets: Column C, Type: Text
AppSheet Configuration:
  Column Name: CustomerPhone
  Type: Text
  Key: No
  Initial Value: ""
  App Formula: N/A
  VALID_IF: NOT(ISBLANK([_THIS]))
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Customer phone number in local format. Required at order creation so staff can reach customer during rental."
```

---

**Column D: PickupDate**

```appsheet
Google Sheets: Column D, Type: Date
AppSheet Configuration:
  Column Name: PickupDate
  Type: Date
  Key: No
  Initial Value: TODAY()
  App Formula: N/A
  VALID_IF: ISNOTBLANK([_THIS])
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Date the customer picks up the dress. Defaults to TODAY(). Drives Calendar lifecycle (Preparing/CurrentlyRenting/Returning)."
```

---

**Column E: Package**

```appsheet
Google Sheets: Column E, Type: Enum (Text base)
AppSheet Configuration:
  Column Name: Package
  Type: Enum
  Enum Base: Text
  Enum Values: Package enum (12h / 1 day / 3 days)
  Key: No
  Initial Value: "1 day"
  App Formula: N/A
  VALID_IF: IN([_THIS], LIST("12h", "1 day", "3 days"))
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Rental package length. Determines ActualReturnDate, dress fee tier (Price12h / Price1d / Price3d), and refund arithmetic."
```

---

**Column F: DepositForm**

```appsheet
Google Sheets: Column F, Type: Enum (Text base)
AppSheet Configuration:
  Column Name: DepositForm
  Type: Enum
  Enum Base: Text
  Enum Values: DepositForm enum (50% + CCCD / 100%)
  Key: No
  Initial Value: "50% + CCCD"
  App Formula: N/A
  VALID_IF: IN([_THIS], LIST("50% + CCCD", "100%"))
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Deposit scheme. '50% + CCCD' = 50% of TotalOriginalPrice plus ID held; '100%' = full original-price deposit. Drives payments.SuggestedDeposit."
```

---

**Column G: Notes**

```appsheet
Google Sheets: Column G, Type: Text (LongText)
AppSheet Configuration:
  Column Name: Notes
  Type: LongText
  Key: No
  Initial Value: ""
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Free-form staff notes (fit issues, alterations, special instructions). Not surfaced in calendar or refund flow."
```

---

**Column H: DressCount (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: DressCount
  Type: Number
  Formula Type: App Formula
  App Formula: COUNT(SELECT(order_dresses[OrderDressId], [OrderId]=[_THISROW].[OrderId]))
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Count of dresses attached to this order via order_dresses join rows. Used as the calendar event title."
```

---

**Column I: TotalOriginalPrice (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: TotalOriginalPrice
  Type: Price
  Formula Type: App Formula
  App Formula: SUM(SELECT(order_dresses[OriginalPriceOfDress], [OrderId]=[_THISROW].[OrderId]))
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Sum of OriginalPriceOfDress across all dresses attached to this order. Drives payments.SuggestedDeposit when DepositForm = '50% + CCCD' or '100%'."
```

---

**Column J: ActualReturnDate (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: ActualReturnDate
  Type: Date
  Formula Type: App Formula
  App Formula: IFS([Package]="12h",[PickupDate],[Package]="1 day",[PickupDate]+1,[Package]="3 days",[PickupDate]+3)
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Computed return date based on Package. 12h returns same day, 1 day adds 1, 3 days adds 3. Drives Calendar end date and Returning/Overdue transitions."
```

---

**Column K: IsRefunded (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: IsRefunded
  Type: Yes/No
  Formula Type: App Formula
  App Formula: COUNT(SELECT(payments[PaymentId], [OrderId]=[_THISROW].[OrderId])) > 0
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "TRUE if any payment row exists for this order. Slices (ActiveOrders, MonthCalendarOrders, PreparingOrders, RentingOrders, ReturningOrders) all filter on IsRefunded = FALSE to hide completed/closed orders."
```

---

**Column L: CalendarStatus (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: CalendarStatus
  Type: Enum (Text base)
  Enum Values: CalendarStatus enum (Preparing / CurrentlyRenting / Returning / Overdue / Upcoming)
  Formula Type: App Formula
  App Formula: IFS([Package]="12h","CurrentlyRenting",[PickupDate]=TODAY(),"Preparing",AND([PickupDate]<TODAY(),[ActualReturnDate]>TODAY()),"CurrentlyRenting",[ActualReturnDate]=TODAY(),"Returning",[ActualReturnDate]<TODAY(),"Overdue",[PickupDate]>TODAY(),"Upcoming")
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Lifecycle bucket for this order. Used by Format Rules to color the calendar. Branches: 12h package always CurrentlyRenting; today pickup = Preparing; between pickup and return = CurrentlyRenting; return day = Returning; past return = Overdue; future pickup = Upcoming."
```

---

**Column M: CustomerAvatar (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: CustomerAvatar
  Type: Text
  Formula Type: App Formula
  App Formula: IF(ISBLANK([CustomerInsta]),"?",TEXT_ICON(UPPER(LEFT([CustomerInsta],1))))
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Rendered as the customer's avatar icon. If CustomerInsta is blank returns '?'; otherwise renders the first uppercase letter of the handle as a TEXT_ICON monogram."
```

---

### 2. order_dresses Table

**Google Sheets:** "order_dresses" tab
**AppSheet Table Name:** order_dresses
**Primary Key:** OrderDressId

**Table-Level Settings:**

```appsheet
Table: order_dresses
  # Table-Level Operations
  Updates Enabled: Yes
  Adds Enabled: Yes
  Deletes Enabled: Yes

  # Row-Level Security Filter
  Security Filter (row-level): TRUE
```

**Columns:**

---

**Column A: OrderDressId**

```appsheet
Google Sheets: Column A, Type: Text
AppSheet Configuration:
  Column Name: OrderDressId
  Type: Text
  Key: Yes
  Initial Value: UNIQUEID()
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Unique identifier for each dress-to-order join row."
```

---

**Column B: OrderId**

```appsheet
Google Sheets: Column B, Type: Ref
AppSheet Configuration:
  Column Name: OrderId
  Type: Ref
  Source Table: orders
  Key: No
  Initial Value: ""
  App Formula: N/A
  VALID_IF: IN([_THIS], orders[OrderId])
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Foreign key to orders.OrderId. Establishes the parent-child relationship used by orders virtual columns (DressCount, TotalOriginalPrice) and payments virtual columns (DressRentalTotal)."
```

---

**Column C: DressId**

```appsheet
Google Sheets: Column C, Type: Ref
AppSheet Configuration:
  Column Name: DressId
  Type: Ref
  Source Table: dresses
  Key: No
  Initial Value: ""
  App Formula: N/A
  VALID_IF: IN([_THIS], dresses[DressId])
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Foreign key to dresses.DressId. Selecting a dress here auto-fills OriginalPriceOfDress and (via lookup of parent order.Package) DressRentalFee."
```

---

**Column D: OriginalPriceOfDress (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: OriginalPriceOfDress
  Type: Price
  Formula Type: App Formula
  App Formula: [DressId].[OriginalPrice]
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Auto-derived from dresses.OriginalPrice via the DressId reference. Used by orders.TotalOriginalPrice (sum) and payments.SuggestedDeposit (multiplier)."
```

---

**Column E: DressRentalFee (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: DressRentalFee
  Type: Price
  Formula Type: App Formula
  App Formula: IFS(LOOKUP([_THISROW].[OrderId],"orders","OrderId","Package")="12h",[DressId].[Price12h],LOOKUP([_THISROW].[OrderId],"orders","OrderId","Package")="1 day",[DressId].[Price1d],LOOKUP([_THISROW].[OrderId],"orders","OrderId","Package")="3 days",[DressId].[Price3d])
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Package-tier rental fee. Looks up the parent order's Package value and pulls the matching dress price column (Price12h / Price1d / Price3d). Falls through all three IFS branches; if Package is none of the three, returns BLANK() (implicit). Powers payments.DressRentalTotal."
```

---

### 3. payments Table

**Google Sheets:** "payments" tab
**AppSheet Table Name:** payments
**Primary Key:** PaymentId

**Table-Level Settings:**

```appsheet
Table: payments
  # Table-Level Operations
  Updates Enabled: Yes
  Adds Enabled: Yes
  Deletes Enabled: No

  # Row-Level Security Filter
  Security Filter (row-level): TRUE
```

**Columns:**

---

**Column A: PaymentId**

```appsheet
Google Sheets: Column A, Type: Text
AppSheet Configuration:
  Column Name: PaymentId
  Type: Text
  Key: Yes
  Initial Value: UNIQUEID()
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Unique identifier for every deposit/refund row."
```

---

**Column B: OrderId**

```appsheet
Google Sheets: Column B, Type: Ref
AppSheet Configuration:
  Column Name: OrderId
  Type: Ref
  Source Table: orders
  Key: No
  Initial Value: ""
  App Formula: N/A
  VALID_IF: IN([_THIS], orders[OrderId])
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Foreign key to orders.OrderId. Powers all payments virtual columns (CustomerName, Package, PickupDate, ActualReturnDate, DepositForm, DressRentalTotal) via deref and SELECT."
```

---

**Column C: PaymentDate**

```appsheet
Google Sheets: Column C, Type: Date
AppSheet Configuration:
  Column Name: PaymentDate
  Type: Date
  Key: No
  Initial Value: TODAY()
  App Formula: N/A
  VALID_IF: ISNOTBLANK([_THIS])
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Date the payment was received (deposit) or refunded. Defaults to TODAY(). CashLedger view sorts by this column DESC."
```

---

**Column D: DepositCash**

```appsheet
Google Sheets: Column D, Type: Price
AppSheet Configuration:
  Column Name: DepositCash
  Type: Price
  Key: No
  Initial Value: 0
  App Formula: N/A
  VALID_IF: [DressRentalTotal]>=0  # Accept any value, including 0 cash + CCCD-only
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Cash amount the customer paid at pickup. Used in RefundAmount = DepositCash − TotalRental − OtherCosts. May be 0 when DepositForm is '50% + CCCD' and only the ID was collected."
```

---

**Column E: AccessoryIds**

```appsheet
Google Sheets: Column E, Type: List (Ref base)
AppSheet Configuration:
  Column Name: AccessoryIds
  Type: List
  Element Type: Ref
  Source Table: accessories
  Key: No
  Initial Value: {}
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "List of accessory Ref values bundled into this payment. Queried by payments.AccessoryRentalTotal via IN() filter."
```

---

**Column F: OtherCosts**

```appsheet
Google Sheets: Column F, Type: Price
AppSheet Configuration:
  Column Name: OtherCosts
  Type: Price
  Key: No
  Initial Value: 0
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Non-dress, non-accessory charges (e.g., dry cleaning, late fee, damage). Subtracted from refund in RefundAmount formula."
```

---

**Column G: RefundStatus**

```appsheet
Google Sheets: Column G, Type: Enum (Text base)
AppSheet Configuration:
  Column Name: RefundStatus
  Type: Enum
  Enum Base: Text
  Enum Values: pending / sent / settled
  Key: No
  Initial Value: "pending"
  App Formula: N/A
  VALID_IF: IN([_THIS], LIST("pending", "sent", "settled"))
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Tracks the lifecycle of the refund: pending (computed), sent (bank transfer initiated), settled (customer confirmed)."
```

---

**Column H: CustomerName (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: CustomerName
  Type: Text
  Formula Type: App Formula
  App Formula: [OrderId].[CustomerInsta]
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Auto-derived customer handle via OrderId deref. Used as the primary header in the RefundDeposit and CashLedger views."
```

---

**Column I: Package (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: Package
  Type: Enum (Text base)
  Enum Values: Package enum (12h / 1 day / 3 days)
  Formula Type: App Formula
  App Formula: [OrderId].[Package]
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Auto-derived rental package from parent order. Surfaces package context inside the refund form so staff can verify without opening OrderDetail."
```

---

**Column J: PickupDate (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: PickupDate
  Type: Date
  Formula Type: App Formula
  App Formula: [OrderId].[PickupDate]
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Auto-derived pickup date from parent order. Shown alongside deposit/refund figures on the RefundDeposit form."
```

---

**Column K: ActualReturnDate (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: ActualReturnDate
  Type: Date
  Formula Type: App Formula
  App Formula: [OrderId].[ActualReturnDate]
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Auto-derived computed return date from parent order. Shown on the RefundDeposit form so staff can verify the rental window before settling."
```

---

**Column L: DepositForm (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: DepositForm
  Type: Enum (Text base)
  Enum Values: DepositForm enum (50% + CCCD / 100%)
  Formula Type: App Formula
  App Formula: [OrderId].[DepositForm]
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Auto-derived deposit scheme from parent order. Drives payments.SuggestedDeposit via IFS branching."
```

---

**Column M: DressRentalTotal (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: DressRentalTotal
  Type: Price
  Formula Type: App Formula
  App Formula: SUM(SELECT(order_dresses[DressRentalFee], [OrderId]=[_THISROW].[OrderId]))
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Sum of DressRentalFee across all order_dresses rows attached to the parent order. Pair with AccessoryRentalTotal to form TotalRental."
```

---

**Column N: AccessoryRentalTotal (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: AccessoryRentalTotal
  Type: Price
  Formula Type: App Formula
  App Formula: SUM(SELECT(accessories[Price1d], IN([_THISROW].[AccessoryIds],[AccessoryId])))
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Sum of accessories.Price1d for every accessory selected in AccessoryIds. The IN() filter tests whether each accessory's AccessoryId appears in the payments.AccessoryIds list. Pairs with DressRentalTotal to form TotalRental."
```

---

**Column O: TotalRental (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: TotalRental
  Type: Price
  Formula Type: App Formula
  App Formula: [DressRentalTotal]+[AccessoryRentalTotal]
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "DressRentalTotal + AccessoryRentalTotal. The gross rental charge subtracted from DepositCash in the refund calculation."
```

---

**Column P: SuggestedDeposit (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: SuggestedDeposit
  Type: Price
  Formula Type: App Formula
  App Formula: IFS([DepositForm]="50% + CCCD",[OrderId].[TotalOriginalPrice]*0.5,[DepositForm]="100%",[OrderId].[TotalOriginalPrice])
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Suggested cash deposit based on parent order's DepositForm. 50% + CCCD → 50% of TotalOriginalPrice; 100% → full TotalOriginalPrice. Shown as a hint on RefundDeposit form so staff can compare against DepositCash."
```

---

**Column Q: RefundAmount (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: RefundAmount
  Type: Price
  Formula Type: App Formula
  App Formula: [DepositCash]-[TotalRental]-[OtherCosts]
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Net refund owed to customer: DepositCash − TotalRental − OtherCosts. May be negative when OtherCosts (e.g., damage) exceed the deposit — CustomerMessage surfaces a warning when this happens."
```

---

**Column R: DressName (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: DressName
  Type: Text
  Formula Type: App Formula
  App Formula: [OrderId].[DressName]
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Auto-derived concatenated dress list from parent order. Surfaces the dress(es) attached to this payment in the CustomerMessage and CashLedger views. (Depends on a corresponding virtual column on orders — see orders.DressName companion rule.)"
```

---

**Column S: CustomerMessage (Virtual)**

```appsheet
Google Sheets: N/A (Virtual column)
AppSheet Configuration:
  Column Name: CustomerMessage
  Type: LongText
  Formula Type: App Formula
  App Formula: IFS([RefundAmount]<0,"⚠ CHECK: refund negative = "&[RefundAmount],CONCATENATE("Customer deposited ",[DepositCash]," - Dresses: ",[DressName]," - Refund: ",[RefundAmount],"d. Please send bank details."))
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Auto-built message to paste to customer. If RefundAmount < 0, returns a warning string naming the negative amount. Otherwise builds a one-line summary: 'Customer deposited X - Dresses: Y - Refund: Z d. Please send bank details.' Copy-from-app ready."
```

---

### 4. dresses Table

**Google Sheets:** "dresses" tab
**AppSheet Table Name:** dresses
**Primary Key:** DressId

**Table-Level Settings:**

```appsheet
Table: dresses
  # Table-Level Operations
  Updates Enabled: Yes
  Adds Enabled: Yes
  Deletes Enabled: No

  # Row-Level Security Filter
  Security Filter (row-level): TRUE
```

**Columns:**

---

**Column A: DressId**

```appsheet
Google Sheets: Column A, Type: Text
AppSheet Configuration:
  Column Name: DressId
  Type: Text
  Key: Yes
  Initial Value: UNIQUEID()
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Unique identifier for each dress in inventory."
```

---

**Column B: DressName**

```appsheet
Google Sheets: Column B, Type: Text
AppSheet Configuration:
  Column Name: DressName
  Type: Text
  Key: No
  Initial Value: ""
  App Formula: N/A
  VALID_IF: NOT(ISBLANK([_THIS]))
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Display name of the dress (e.g., 'Rose Velvet Gown'). Surfaced as primary header in Dresses gallery and DressDetail detail view."
```

---

**Column C: Size**

```appsheet
Google Sheets: Column C, Type: Text
AppSheet Configuration:
  Column Name: Size
  Type: Text
  Key: No
  Initial Value: ""
  App Formula: N/A
  VALID_IF: IN([_THIS], LIST("XS", "S", "M", "L", "XL"))
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Standard apparel size. Surfaced as secondary header in Dresses gallery and combined into DressDetail header."
```

---

**Column D: CategoryId**

```appsheet
Google Sheets: Column D, Type: Ref
AppSheet Configuration:
  Column Name: CategoryId
  Type: Ref
  Source Table: dress_categories
  Key: No
  Initial Value: ""
  App Formula: N/A
  VALID_IF: IN([_THIS], dress_categories[CategoryId])
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Foreign key to dress_categories.CategoryId. Used for filtering the Dresses gallery by category."
```

---

**Column E: ImageUrl**

```appsheet
Google Sheets: Column E, Type: Image (URL)
AppSheet Configuration:
  Column Name: ImageUrl
  Type: Image
  Key: No
  Initial Value: ""
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Public URL to dress image. Renders as the gallery card image in Dresses view and the hero image in DressDetail view."
```

---

**Column F: OriginalPrice**

```appsheet
Google Sheets: Column F, Type: Price
AppSheet Configuration:
  Column Name: OriginalPrice
  Type: Price
  Key: No
  Initial Value: 0
  App Formula: N/A
  VALID_IF: [DressRentalTotal]>=0
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Retail/original price of the dress. Used as the deposit base when DepositForm = '100%' and as the 50% base when '50% + CCCD'. Pulled into order_dresses.OriginalPriceOfDress via deref."
```

---

**Column G: Price12h**

```appsheet
Google Sheets: Column G, Type: Price
AppSheet Configuration:
  Column Name: Price12h
  Type: Price
  Key: No
  Initial Value: 0
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "12-hour rental price. Pulled into order_dresses.DressRentalFee when parent order.Package = '12h'."
```

---

**Column H: Price1d**

```appsheet
Google Sheets: Column H, Type: Price
AppSheet Configuration:
  Column Name: Price1d
  Type: Price
  Key: No
  Initial Value: 0
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "1-day rental price. Pulled into order_dresses.DressRentalFee when parent order.Package = '1 day'."
```

---

**Column I: Price3d**

```appsheet
Google Sheets: Column I, Type: Price
AppSheet Configuration:
  Column Name: Price3d
  Type: Price
  Key: No
  Initial Value: 0
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "3-day rental price. Pulled into order_dresses.DressRentalFee when parent order.Package = '3 days'."
```

---

**Column J: IsAvailable**

```appsheet
Google Sheets: Column J, Type: Yes/No
AppSheet Configuration:
  Column Name: IsAvailable
  Type: Yes/No
  Key: No
  Initial Value: TRUE
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Manual availability flag. Staff toggles FALSE when dress is in repair / dry-clean. Used by VALID_IF on order_dresses.DressId in production; reserved for future filtering."
```

---

### 5. accessories Table

**Google Sheets:** "accessories" tab
**AppSheet Table Name:** accessories
**Primary Key:** AccessoryId

**Table-Level Settings:**

```appsheet
Table: accessories
  # Table-Level Operations
  Updates Enabled: Yes
  Adds Enabled: Yes
  Deletes Enabled: No

  # Row-Level Security Filter
  Security Filter (row-level): TRUE
```

**Columns:**

---

**Column A: AccessoryId**

```appsheet
Google Sheets: Column A, Type: Text
AppSheet Configuration:
  Column Name: AccessoryId
  Type: Text
  Key: Yes
  Initial Value: UNIQUEID()
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Unique identifier for each accessory in inventory."
```

---

**Column B: AccessoryName**

```appsheet
Google Sheets: Column B, Type: Text
AppSheet Configuration:
  Column Name: AccessoryName
  Type: Text
  Key: No
  Initial Value: ""
  App Formula: N/A
  VALID_IF: NOT(ISBLANK([_THIS]))
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Display name of the accessory (e.g., 'Pearl Clutch'). Surfaced as primary header in Accessories gallery and AccessoryDetail header."
```

---

**Column C: Type**

```appsheet
Google Sheets: Column C, Type: Enum (Text base)
AppSheet Configuration:
  Column Name: Type
  Type: Enum
  Enum Base: Text
  Enum Values: Shoes / Bag / Jewelry / Veil / Other
  Key: No
  Initial Value: "Other"
  App Formula: N/A
  VALID_IF: IN([_THIS], LIST("Shoes", "Bag", "Jewelry", "Veil", "Other"))
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Accessory category. Surfaced in AccessoryDetail header combined with AccessoryName."
```

---

**Column D: Price1d**

```appsheet
Google Sheets: Column D, Type: Price
AppSheet Configuration:
  Column Name: Price1d
  Type: Price
  Key: No
  Initial Value: 0
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "1-day rental price. Pulled into payments.AccessoryRentalTotal via IN() filter on payments.AccessoryIds."
```

---

**Column E: ImageUrl**

```appsheet
Google Sheets: Column E, Type: Image (URL)
AppSheet Configuration:
  Column Name: ImageUrl
  Type: Image
  Key: No
  Initial Value: ""
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Public URL to accessory image. Renders as the gallery card image in Accessories view and the hero image in AccessoryDetail view."
```

---

### 6. customers Table

**Google Sheets:** "customers" tab
**AppSheet Table Name:** customers
**Primary Key:** CustomerInsta

**Table-Level Settings:**

```appsheet
Table: customers
  # Table-Level Operations
  Updates Enabled: Yes
  Adds Enabled: Yes
  Deletes Enabled: No

  # Row-Level Security Filter
  Security Filter (row-level): TRUE
```

**Columns:**

---

**Column A: CustomerInsta**

```appsheet
Google Sheets: Column A, Type: Text
AppSheet Configuration:
  Column Name: CustomerInsta
  Type: Text
  Key: Yes
  Initial Value: ""
  App Formula: N/A
  VALID_IF: NOT(ISBLANK([_THIS]))
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Customer's Instagram handle — acts as the natural primary key. Soft-linked to orders.CustomerInsta (text field; not a Ref by design to keep new-customer friction low)."
```

---

**Column B: FullName**

```appsheet
Google Sheets: Column B, Type: Text
AppSheet Configuration:
  Column Name: FullName
  Type: Text
  Key: No
  Initial Value: ""
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Real name of the customer (optional). Useful for delivery notes and bank-transfer reference."
```

---

**Column C: Phone**

```appsheet
Google Sheets: Column C, Type: Text
AppSheet Configuration:
  Column Name: Phone
  Type: Text
  Key: No
  Initial Value: ""
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Phone number — denormalized copy of orders.CustomerPhone for repeat-customer quick lookup."
```

---

**Column D: TotalOrders**

```appsheet
Google Sheets: Column D, Type: Number
AppSheet Configuration:
  Column Name: TotalOrders
  Type: Number
  Key: No
  Initial Value: 0
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Manual count of past orders (staff-maintained). Future enhancement: replace with COUNT(SELECT(...)) virtual column."
```

---

**Column E: Notes**

```appsheet
Google Sheets: Column E, Type: LongText
AppSheet Configuration:
  Column Name: Notes
  Type: LongText
  Key: No
  Initial Value: ""
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Free-form customer notes (preferences, fit history, no-shows)."
```

---

### 7. dress_categories Table

**Google Sheets:** "dress_categories" tab
**AppSheet Table Name:** dress_categories
**Primary Key:** CategoryId

**Table-Level Settings:**

```appsheet
Table: dress_categories
  # Table-Level Operations
  Updates Enabled: Yes
  Adds Enabled: Yes
  Deletes Enabled: No

  # Row-Level Security Filter
  Security Filter (row-level): TRUE
```

**Columns:**

---

**Column A: CategoryId**

```appsheet
Google Sheets: Column A, Type: Text
AppSheet Configuration:
  Column Name: CategoryId
  Type: Text
  Key: Yes
  Initial Value: UNIQUEID()
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: FALSE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Unique identifier for each dress category."
```

---

**Column B: CategoryName**

```appsheet
Google Sheets: Column B, Type: Text
AppSheet Configuration:
  Column Name: CategoryName
  Type: Text
  Key: No
  Initial Value: ""
  App Formula: N/A
  VALID_IF: NOT(ISBLANK([_THIS]))
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: YES
  Description: "Display name (e.g., 'Cocktail', 'Wedding', 'Vintage', 'Prom')."
```

---

**Column C: DisplayOrder**

```appsheet
Google Sheets: Column C, Type: Number
AppSheet Configuration:
  Column Name: DisplayOrder
  Type: Number
  Key: No
  Initial Value: 0
  App Formula: N/A
  VALID_IF: N/A
  EDITABLE: TRUE
  SHOW: TRUE
  SHOW IF: TRUE
  REQUIRE: NO
  Description: "Sort weight for the gallery category filter. Lower numbers appear first."
```

---

## Related order_dresses Auto-Deref Rules

The payments table dereferences the parent order via `[OrderId].[ColumnName]` for the following fields. Each rule is a payments virtual column whose value is automatically fetched from the related orders row. Staff never re-enters these values on the RefundDeposit form — they appear read-only as soon as OrderId is set.

| Payments Virtual Column | Source Column (orders) | Purpose |
|---|---|---|
| CustomerName | orders.CustomerInsta | Identify the customer in the refund message |
| Package | orders.Package | Confirm the rental window without leaving the form |
| PickupDate | orders.PickupDate | Show when the rental began |
| ActualReturnDate | orders.ActualReturnDate | Show the computed return date (12h same-day / 1d +1 / 3d +3) |
| DepositForm | orders.DepositForm | Drives SuggestedDeposit IFS branching |
| TotalOriginalPrice (used inside SuggestedDeposit) | orders.TotalOriginalPrice (virtual) | Base amount for 50% or 100% deposit calculation |
| DressName (used inside CustomerMessage) | orders.DressName (companion virtual column on orders) | Human-readable dress list inside the refund message |

The order_dresses table dereferences dresses via `[DressId].[ColumnName]`:
- order_dresses.OriginalPriceOfDress ← dresses.OriginalPrice
- order_dresses.DressRentalFee ← dresses.Price12h / Price1d / Price3d (selected by parent order's Package via LOOKUP)

---

## 📋 ALL ENUMS

**Enum: Package**

```appsheet
Enum Name: Package
Values:
  - 12h
  - 1 day
  - 3 days

Used in:
  - orders.Package (drives ActualReturnDate, CalendarStatus, DressRentalFee)
  - payments.Package (virtual, deref from orders.Package)

Description: "Rental duration package. Drives the computed return date and selects the matching dress price tier."
```

**Enum: DepositForm**

```appsheet
Enum Name: DepositForm
Values:
  - 50% + CCCD
  - 100%

Used in:
  - orders.DepositForm (drives payments.SuggestedDeposit IFS)
  - payments.DepositForm (virtual, deref from orders.DepositForm)

Description: "Deposit scheme. '50% + CCCD' = 50% of original price + ID held; '100%' = full original price in cash."
```

**Enum: CalendarStatus**

```appsheet
Enum Name: CalendarStatus
Values:
  - Preparing
  - CurrentlyRenting
  - Returning
  - Overdue
  - Upcoming

Used in:
  - orders.CalendarStatus (virtual, drives Format Rules)
  - Format Rules on Calendar view

Description: "Lifecycle bucket for an order. Computed from PickupDate + Package + ActualReturnDate."
```

---

## 📋 ALL SLICES

**Slice: ActiveOrders**

```appsheet
Slice Name: ActiveOrders
Source Table: orders
Row Filter Formula: [IsRefunded]=FALSE
Description: "Every order that has not yet been refunded. Feeds the Orders table view; excludes closed/refunded orders."
```

**Slice: MonthCalendarOrders**

```appsheet
Slice Name: MonthCalendarOrders
Source Table: orders
Row Filter Formula: AND([IsRefunded]=FALSE,[PickupDate]>=EOMONTH(TODAY(),-2),[PickupDate]<=EOMONTH(TODAY(),0))
Description: "Two-month calendar window (current month + previous month end boundary). Drives the Calendar view. EOMONTH(TODAY(),-2) is the first day of last month; EOMONTH(TODAY(),0) is the last day of this month."
```

**Slice: PreparingOrders**

```appsheet
Slice Name: PreparingOrders
Source Table: orders
Row Filter Formula: AND([CalendarStatus]="Preparing",[IsRefunded]=FALSE)
Description: "Orders with pickup today that haven't been refunded. Reserved for a future 'Today / Pickup queue' view."
```

**Slice: RentingOrders**

```appsheet
Slice Name: RentingOrders
Source Table: orders
Row Filter Formula: AND([CalendarStatus]="CurrentlyRenting",[IsRefunded]=FALSE)
Description: "Orders currently in possession of the customer. Reserved for a future 'Active rentals' view."
```

**Slice: ReturningOrders**

```appsheet
Slice Name: ReturningOrders
Source Table: orders
Row Filter Formula: AND([CalendarStatus]="Returning",[IsRefunded]=FALSE)
Description: "Orders due back today that haven't been refunded. Reserved for a future 'Returns queue' view."
```

---

## 📋 ALL VIEWS

**View 1: Calendar**

```appsheet
View Name: Calendar
View Type: calendar
For this data: MonthCalendarOrders (slice)
Position: primary

Display settings:
  Start: [PickupDate]
  End: [ActualReturnDate]
  Title: [DressCount]   # renders as the count of dresses attached
  Description: [CustomerInsta]

Group by: N/A
Sort by: [PickupDate] (ascending)

Actions:
  - OpenOrderFromCalendar

SHOW IF: TRUE

Security:
  Owner: Can see all orders in the calendar window
  Notes: Each event spans the full rental window via Start/End, so a 3-day rental renders as a 3-day block
```

**View 2: Orders**

```appsheet
View Name: Orders
View Type: table
For this data: ActiveOrders (slice)
Position: primary

Display settings:
  Show: OrderId, CustomerInsta, PickupDate, Package, DressCount, TotalOriginalPrice, CalendarStatus

Group by: N/A
Sort by: [PickupDate] (descending)

Actions:
  - ProcessRefund

SHOW IF: TRUE

Security:
  Owner: Can see all active orders
  Notes: Search enabled by default for table view
```

**View 3: OrderDetail**

```appsheet
View Name: OrderDetail
View Type: detail
For this data: orders
Position: detail (linked from Calendar)

Display settings:
  Sections:
    - Customer: OrderId, CustomerInsta, CustomerPhone, CustomerAvatar
    - Schedule: PickupDate, Package, ActualReturnDate, CalendarStatus
    - Dresses: inline related order_dresses (DressId, OriginalPriceOfDress, DressRentalFee)
    - Accessories: inline related payments.AccessoryIds
    - Finance: TotalOriginalPrice, DepositForm, IsRefunded

Group by: N/A
Sort by: N/A

Actions:
  - ProcessRefund   # the "Refund" button on the detail view
  - Edit

SHOW IF: TRUE

Security:
  Owner: Can open any order
  Notes: Tap any calendar event to land here
```

**View 4: RefundDeposit**

```appsheet
View Name: RefundDeposit
View Type: form
For this data: payments
Position: form

Display settings:
  Fields (in order):
    - OrderId (prefilled by ProcessRefund action)
    - CustomerName (virtual, read-only)
    - Package (virtual, read-only)
    - PickupDate (virtual, read-only)
    - ActualReturnDate (virtual, read-only)
    - DepositForm (virtual, read-only)
    - DepositCash
    - AccessoryIds
    - OtherCosts
    - DressRentalTotal (virtual, read-only)
    - AccessoryRentalTotal (virtual, read-only)
    - TotalRental (virtual, read-only)
    - SuggestedDeposit (virtual, read-only)
    - RefundAmount (virtual, read-only)
    - DressName (virtual, read-only)
    - CustomerMessage (virtual, read-only, copy-to-clipboard friendly)
    - RefundStatus
    - PaymentDate

Group by: N/A
Sort by: N/A

Actions:
  - Save

SHOW IF: TRUE

Security:
  Owner: Can create a payment row
  Notes: The ProcessRefund action deep-links here with OrderId pre-filled
```

**View 5: CashLedger**

```appsheet
View Name: CashLedger
View Type: table
For this data: payments
Position: primary

Display settings:
  Show: PaymentId, OrderId, CustomerName, PaymentDate, DepositCash, TotalRental, RefundAmount, RefundStatus

Group by: N/A
Sort by: [PaymentDate] (descending)

Actions:
  - Edit
  - View Order

SHOW IF: TRUE

Security:
  Owner: Can see every deposit and refund row
```

**View 6: Dresses**

```appsheet
View Name: Dresses
View Type: gallery
For this data: dresses
Position: primary

Display settings:
  Image: [ImageUrl]
  Primary header: [DressName]
  Secondary header: [Size]
  Summary column: [CategoryId]

Group by: [CategoryId]
Sort by: [DressName] (ascending)

Actions:
  - NewOrderFromDress   # tap to start a new order with this dress pre-selected
  - View

SHOW IF: TRUE

Security:
  Owner: Can browse the dress catalog
```

**View 7: DressDetail**

```appsheet
View Name: DressDetail
View Type: detail
For this data: dresses
Position: detail (linked from Dresses gallery)

Display settings:
  Image: [ImageUrl]   # hero image at top
  Header: [DressName] & " - " & [Size]
  Sections:
    - Pricing: OriginalPrice, Price12h, Price1d, Price3d, IsAvailable
    - Related orders: inline related order_dresses rows (OrderId, OriginalPriceOfDress, DressRentalFee)

Group by: N/A
Sort by: N/A

Actions:
  - NewOrderFromDress   # tap to start a new order with this dress pre-selected
  - Edit

SHOW IF: TRUE

Security:
  Owner: Can open any dress detail
  Notes: Related order_dresses section surfaces every order that included this dress
```

**View 8: Accessories**

```appsheet
View Name: Accessories
View Type: gallery
For this data: accessories
Position: primary

Display settings:
  Image: [ImageUrl]
  Primary header: [AccessoryName]
  Secondary header: [Type]

Group by: [Type]
Sort by: [AccessoryName] (ascending)

Actions:
  - View

SHOW IF: TRUE

Security:
  Owner: Can browse the accessory catalog
```

**View 9: AccessoryDetail**

```appsheet
View Name: AccessoryDetail
View Type: detail
For this data: accessories
Position: detail (linked from Accessories gallery)

Display settings:
  Image: [ImageUrl]   # hero image at top
  Header: [AccessoryName] & " - " & [Type]
  Sections:
    - Pricing: Price1d

Group by: N/A
Sort by: N/A

Actions:
  - Edit

SHOW IF: TRUE

Security:
  Owner: Can open any accessory detail
```

---

## 📋 ALL ACTIONS

**Action: OpenOrderFromCalendar**

```appsheet
Action Name: OpenOrderFromCalendar
For a record of this table: orders
Do this:
  - App: go to another view within this app

Referenced Rows: N/A

Column values to set: N/A

SHOW IF: TRUE
Display prominently: No
Icon: event
Description: "Tap a calendar event to open its OrderDetail view."
```

**Action: NewOrderFromDress**

```appsheet
Action Name: NewOrderFromDress
For a record of this table: dresses
Do this:
  - App: go to another view within this app

Referenced Rows: N/A

Column values to set:
  # Prefilled into the new order form via LINKTOFORM / deep-link expression
  OrderId: (new UNIQUEID at form load)
  # DressId is captured from the source row by AppSheet context and offered as the default on the new-order form

SHOW IF: TRUE
Display prominently: Yes
Icon: add_shopping_cart
Description: "Start a new order with this dress pre-selected. Lands on the NewOrder form."
```

**Action: ProcessRefund**

```appsheet
Action Name: ProcessRefund
For a record of this table: orders
Do this:
  - App: go to another view within this app

Referenced Rows: N/A

Column values to set:
  # Prefilled into the RefundDeposit form via LINKTOFORM / deep-link expression
  PaymentId: (new UNIQUEID at form load)
  OrderId: [_THISROW].[OrderId]   # carries the source order into the new payment row
  PaymentDate: TODAY()
  RefundStatus: "pending"

SHOW IF: [IsRefunded]=FALSE
Display prominently: Yes
Icon: payments
Description: "Open the RefundDeposit form with this order's OrderId pre-filled. Hidden once a payment row already exists for the order."
```

---

## 📋 ALL FORMAT RULES

**Format Rule: Preparing**

```appsheet
Format Rule Name: Preparing
For: Calendar view
Applies To: orders
Condition: [CalendarStatus]="Preparing"

Format:
  Background color: #27AE60
  Text color: white
  Bold: Yes
```

**Format Rule: CurrentlyRenting**

```appsheet
Format Rule Name: CurrentlyRenting
For: Calendar view
Applies To: orders
Condition: [CalendarStatus]="CurrentlyRenting"

Format:
  Background color: #F39C12
  Text color: black
  Bold: Yes
```

**Format Rule: Returning**

```appsheet
Format Rule Name: Returning
For: Calendar view
Applies To: orders
Condition: [CalendarStatus]="Returning"

Format:
  Background color: #E74C3C
  Text color: white
  Bold: Yes
```

**Format Rule: Overdue**

```appsheet
Format Rule Name: Overdue
For: Calendar view
Applies To: orders
Condition: [CalendarStatus]="Overdue"

Format:
  Background color: #95A5A6
  Text color: white
  Bold: No
```

**Format Rule: Upcoming**

```appsheet
Format Rule Name: Upcoming
For: Calendar view
Applies To: orders
Condition: [CalendarStatus]="Upcoming"

Format:
  Background color: #3498DB
  Text color: white
  Bold: No
```

---