# Product Requirements Document (PRD)

**Project Name:** Aura Rental — Vietnamese Dress Rental Management System
**Version:** 1.0.0
**Date:** 2026-06-27
**Owner:** Aura Rental — Shop Manager
**Status:** Draft

---

## 1. Purpose & Problem Statement

**What problem are we solving?**
Aura Rental is a small Vietnamese shop that rents dresses and accessories for events (weddings, photoshoots, galas). Today the shop runs at ~500 orders per month with 120 dresses in rotation, tracked through a combination of paper notebooks, Messenger chats, and ad-hoc spreadsheets. This causes:
- Double-booking of dresses during peak wedding season
- Lost or delayed deposit refunds
- No real-time view of which dresses are currently out, being prepared, or overdue
- Manual reconstruction of cash ledger entries (deposits, rental fees, late fees, refunds)
- Missed customer form submissions from Facebook/Instagram landing pages
- Staff spending 2+ hours/day just answering "is this dress free on date X?"

**Why is this important?**
- The shop loses an estimated 5-10 orders/month to missed availability inquiries and slow responses.
- Deposit refunds are the single largest source of customer complaints.
- Manual tracking does not scale beyond ~120 dresses; the shop is approaching that ceiling.
- Without reliable inventory visibility, the shop cannot confidently accept last-minute bookings that drive the highest margin.

**Who is this for?**
Primary users: the 2-3 shop staff who manage the rental floor day-to-day (booking, preparing, handing out, receiving returns, handling refunds). Secondary users: the shop owner (financial oversight, reporting) and customers (indirectly, through faster, more accurate service).

---

## 2. Target Audience & User Personas

**Primary Users:**
- **Shop Owner / Manager** — Owns the business, sets pricing and policies, reviews weekly revenue and deposit ledger.
  - Pain Points: No consolidated view of monthly revenue; deposit refund disputes; no reliable data for buying new inventory.
  - Goals: Track profitability per dress, monitor deposit liability, identify best-selling styles.

- **Front-Line Staff (2-3 people)** — Handles customer inquiries, creates orders, prepares dresses, processes returns and refunds.
  - Pain Points: Checking availability by scrolling through Messenger; re-keying customer info from forms; remembering which dress is out with which customer; reconciling cash at end of day.
  - Goals: Answer availability in under 30 seconds, create an order in under 2 minutes, never lose a deposit, find overdue returns instantly.

**Secondary Users:**
- **Customers** — Submit booking requests via a public form, then interact with staff for deposit/payment and pickup/return. (No direct app access — they receive confirmations via Messenger/Zalo.)
- **Accountant / Tax Preparer** — Reads the Cash Ledger at month-end for bookkeeping.

---

## 3. Features & Functionality

### Must-Have Features (MVP)
The MVP is ordered by the priority use cases specified for this project:

1. **Check Availability (Priority #1)** — Staff can answer "is dress X free from date A to date B?" in seconds. Must detect conflicts across all current and pending orders and show a clear available/blocked timeline per dress.
2. **Create Order (Priority #2)** — Staff can create a rental order from a customer request in under 2 minutes: select customer (or create new), select one or more dresses and optional accessories, set rental dates, record deposit amount, set status to Preparing.
3. **Process Deposit Refund (Priority #3)** — When a dress is returned in good condition, staff can mark the order complete and record the deposit refund (full / partial / forfeited) with a reason. The action updates the Cash Ledger and customer history.
4. **Track Return Status (Priority #4)** — A Rental Calendar view shows every order bucketed by status: Upcoming, Preparing, Currently Renting, Returning, Overdue. Staff can move orders between statuses and see overdue items highlighted.

**Supporting Must-Have Capabilities:**
- **Inventory (Kho)** — Maintain the catalog of dresses (size, color, condition, rental price, deposit amount, status) and accessories (category, rental price).
- **Customer (Khách hàng)** — Maintain a single customer record per person with contact info, measurement notes, and rental history.
- **Cash Ledger (Sổ thu chi)** — Every payment and refund is a ledger entry linked to an order, so the daily balance is always reconcilable.
- **Form Submissions (Đơn từ Form)** — Inbound requests from the public booking form land in a queue that staff can promote to a draft order.

### Should-Have Features
1. **SMS / Zalo Confirmation Templates** — One-tap send of pickup confirmation and return reminder to customer.
2. **Photo Attachments per Dress** — Multiple photos per dress to support customer browsing and condition evidence at return.
3. **Customer Rental History** — Quick view of every previous order for the customer (helps with repeat customers and dispute resolution).
4. **Overdue Alerts Dashboard** — First-screen widget that lists all Overdue and Returning-today orders.

### Could-Have Features (Future)
1. **Revenue & Utilization Reports** — Monthly revenue per dress, utilization rate, popular color/size trends.
2. **Customer Self-Service Portal** — Customers check availability and submit booking requests directly.
3. **Maintenance Log per Dress** — Track dry-cleaning, repairs, and downtime between rentals.
4. **Loyalty / Repeat Customer Discounts** — Auto-apply discount after N rentals.

### Won't-Have (Out of Scope for MVP)
- Online payment gateway integration (deposits and fees are collected in cash or bank transfer, recorded manually).
- Native mobile app (the system runs in a mobile-friendly web/app shell — no separate iOS/Android app).
- Multi-location support (Aura Rental operates a single shop).
- Automated SMS gateway (confirmations stay manual via Messenger/Zalo templates in MVP).
- Accounting software integration (Cash Ledger exports to CSV at month-end; full integration deferred).

---

## 4. Success Metrics & KPIs

**How will we measure success?**

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Availability-check response time | < 30 seconds per inquiry | Staff self-report + spot timing |
| Order creation time | < 2 minutes from request to saved order | Spot timing during pilot week |
| Double-booking incidents | 0 per month | Audit of order conflicts |
| Deposit refund processing time | Same-day at return (within 30 min) | Order timestamps |
| Overdue dresses identified within 1 hour of due time | 100% | Overdue widget vs. return log |
| Staff time saved per day | ≥ 1.5 hours (vs. paper + Messenger baseline) | Before/after time study |
| Form submissions lost or missed | 0 per month | Form Submissions queue audit |
| Monthly orders handled without system slowdown | 500+ orders/month | System performance logs |
| Cash Ledger reconciliation variance | < 1% of monthly revenue | End-of-month count |

**Release Criteria:**
- [ ] All four priority use cases (Check Availability, Create Order, Deposit Refund, Return Status) implemented and tested end-to-end
- [ ] Inventory seeded with 120 dresses and accessory catalog
- [ ] Two staff trained and able to operate the system independently
- [ ] Cash Ledger reconciles against a paper baseline for one full week
- [ ] System handles 500 orders/month with sub-second load on standard views
- [ ] Backup and recovery procedure documented and tested

---

## 5. User Flow (High-Level)

**Primary User Journey — Customer books a dress:**

1. Customer submits a booking request via the public Form (Đơn từ Form) with desired dress, dates, and contact info.
2. Staff opens the Form Submissions queue, sees the new request.
3. Staff uses Check Availability on the requested dress for the requested dates — system shows green (free) or red (conflict).
4. If available, Staff clicks "Create Order" — selects/creates Customer, adds dress and any accessories, enters deposit amount, sets status = Preparing.
5. System creates the Order, the linked Order-Dress record, and the deposit entry in the Cash Ledger.
6. Staff sends a Messenger/Zalo confirmation to the customer using a template.
7. On pickup day, Staff moves the order from Preparing → Currently Renting, hands over the dress, and records any remaining balance payment.
8. On return day, Staff inspects the dress. If clean and undamaged, Staff processes the Deposit Refund (full / partial / forfeited), which writes to the Cash Ledger and moves the order to Returning → Completed.
9. Result: Order closed, dress available again, ledger balanced, customer history updated.

**Secondary Journey — Overdue recovery:**

1. Overdue widget surfaces dresses not returned by the due date.
2. Staff contacts customer, updates the expected return date if agreed.
3. If no response, Staff records a late fee in the Cash Ledger and notes the dispute on the order.

---

## 6. Technical & System Requirements

**Platform:**
AppSheet (no-code app platform, mobile-friendly) with a companion Google Sheets backend and lightweight Apps Script glue. The shop is non-technical and must be able to maintain the system themselves.

**Data Storage:**
Google Sheets (cloud spreadsheet) as the source of truth, accessed via AppSheet.

**Integrations:**
- Google Sheets — Primary data store for all 7 tables
- Gmail / Apps Script — Optional transactional emails (deposit receipts, return reminders)
- Facebook / Instagram form webhooks — Populate the Form Submissions queue

**Data Model (7 tables, English schema, snake_case table names, PascalCase columns):**

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `orders` | One row per rental order (Đơn hàng) | OrderId, CustomerId, OrderDate, RentalStartDate, RentalEndDate, Status (Preparing / Currently Renting / Returning / Overdue / Completed / Cancelled), TotalRentalFee, DepositAmount, DepositRefundAmount, Notes |
| `order_dresses` | Line items linking orders to dresses and accessories | OrderDressId, OrderId, DressId, AccessoryId, RentalPrice, DepositAmount |
| `dresses` | Master inventory of dresses (Váy) | DressId, DressName, Size, Color, Condition, RentalPrice, DepositAmount, Status (Available / Rented / InMaintenance / Retired), Notes |
| `accessories` | Catalog of accessories (Phụ kiện) | AccessoryId, AccessoryName, Category, RentalPrice, Status, Notes |
| `payments` | Cash Ledger entries (Sổ thu chi) | PaymentId, OrderId, PaymentDate, Type (Deposit / RentalFee / Refund / LateFee / Adjustment), Amount, Direction (In / Out), Method (Cash / BankTransfer), Notes |
| `availability_checks` | Log of availability lookups for analytics and audit (Lịch thuê) | CheckId, CheckDate, DressId, RequestedStartDate, RequestedEndDate, Result (Available / Conflict), CheckedBy |
| `form_submissions` | Inbound booking requests from public form (Đơn từ Form) | SubmissionId, SubmittedAt, CustomerName, CustomerPhone, RequestedDressId, RequestedStartDate, RequestedEndDate, Source, Status (New / Promoted / Discarded), PromotedOrderId |

**Performance Requirements:**
- Response time: < 2 seconds for typical list/detail views in AppSheet
- Concurrent users: 3 staff simultaneously
- Data capacity: 500 orders/month ≈ 6,000 orders/year, 120 dresses, ~300 accessories, ~24,000 ledger entries/year
- Uptime: 99% (dependent on Google infrastructure)

**Access Requirements:**
- Mobile access (Android/iOS via AppSheet app) — primary mode for floor staff
- Desktop access via browser (for the owner doing weekly reviews)
- Offline-tolerant for order lookups on the shop floor; sync when back online
- Role-based view: Owner sees financial reports; Staff see operational views

---

## 7. Assumptions & Constraints

**Assumptions:**
- The shop has reliable Wi-Fi and 3 staff each with a smartphone.
- Customers continue to submit requests primarily via Facebook/Instagram form (not via phone call) for the Form Submissions use case.
- Vietnamese-language text in customer names and notes is acceptable in the underlying data; UI labels and schema are English.
- Average rental duration is 1-4 days; deposits are collected in cash or bank transfer and reconciled daily.
- The shop operates a single physical location.
- Staff are comfortable with basic mobile app usage but are not developers — the system must be maintainable by shop staff with light IT support.

**Constraints:**
- No budget for custom development — must use AppSheet no-code platform.
- Must work on the existing mobile devices staff already use.
- Pricing must fit a small shop budget (AppSheet standard tier acceptable).
- Schema and tabs must be English (snake_case tables, PascalCase columns) per project standard — no Vietnamese diacritics in column names.
- All seven tables described above are required; no fewer, no different naming.

---

## 8. Risks & Dependencies

**Risks:**

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Double-booking due to race conditions when two staff create orders simultaneously | High | Medium | Optimistic UI + post-save conflict check; staff training to confirm before save |
| Data loss in Google Sheets (accidental deletion, formula overwrite) | High | Low | Daily automated backup; version history; write-protect header rows |
| AppSheet plan limits hit as order volume grows past 500/month | Medium | Medium | Monitor row counts quarterly; archive completed orders older than 12 months |
| Deposit refund errors leading to customer disputes | High | Medium | Mandatory Notes field on every refund; daily owner review of Out payments |
| Staff resistance to switching from paper / Messenger | Medium | Medium | Pilot with one enthusiastic staff member first; visible time savings in week 1 |
| Form Submissions dropped or duplicated from Facebook webhook | Medium | Medium | Idempotency check on SubmissionId; manual reconcile queue weekly |
| Vietnamese text rendering issues in AppSheet reports | Low | Low | Test with realistic customer data during pilot |

**Dependencies:**
- Google Workspace account with sufficient AppSheet licensing for 3-4 users
- Facebook/Instagram form setup or webhook configuration (or manual import as a fallback)
- AppSheet app provisioning and policy approval
- Initial inventory data entry (120 dresses + accessories) — estimated 1-2 days
- Staff training time — 2-3 days for confident adoption
- Owner availability for a weekly 30-minute review during the first month

---

## 9. Timeline & Milestones

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| PRD Approved | 2026-07-05 | Planned |
| Schema and Google Sheets backend ready | 2026-07-15 | Planned |
| AppSheet app prototype (4 priority use cases) | 2026-07-30 | Planned |
| Inventory seeded (120 dresses + accessories) | 2026-08-05 | Planned |
| Staff training complete | 2026-08-10 | Planned |
| Pilot week (live orders only in new system) | 2026-08-15 | Planned |
| Cash Ledger reconciliation validated | 2026-08-22 | Planned |
| Full launch | 2026-09-01 | Planned |
| First monthly review | 2026-10-01 | Planned |

---

## 10. Stakeholder Sign-Off

| Stakeholder | Role | Approval Date | Signature/Status |
|-------------|------|---------------|------------------|
| [Shop Owner] | Business Sponsor | [Date] | ☐ Pending / ☐ Approved |
| [Lead Staff] | Product Owner / Operations Lead | [Date] | ☐ Pending / ☐ Approved |
| [Technical Consultant] | Technical Lead (AppSheet) | [Date] | ☐ Pending / ☐ Approved |

---

## 11. Open Questions & Decisions Needed

- [ ] Will the public booking form be Facebook Lead Ads, a Google Form, or a website widget? (Affects Form Submissions integration approach)
- [ ] What is the default deposit refund policy when a dress returns with minor damage — auto partial refund % or case-by-case staff decision?
- [ ] Should late fees be a fixed amount per day or a percentage of rental fee? (Need owner policy decision)
- [ ] How long should completed orders remain in the active system before being archived?
- [ ] Do we need a separate "VIP customer" flag in the Customer record, or is rental count sufficient?
- [ ] Will the shop accept reservations more than 6 months in advance? (Affects availability-check horizon)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-06-27 | [Shop Owner / Consultant] | Initial PRD |

---

## Notes

- This is a **high-level** document focused on **what** to build, not **how** to build it
- For detailed technical specifications, see `docs/formulas/` folder
- This document should be reviewed and updated as requirements evolve
- Keep it concise and focused on strategic alignment
- Schema is intentionally English (snake_case tables, PascalCase columns, no Vietnamese diacritics) so the system can scale beyond the current shop and be maintained by non-Vietnamese-speaking support if needed