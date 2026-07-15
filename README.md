# Aura Rental — Dress Rental Manager

A complete rental management system for Aura Rental, a small dress rental shop in Vietnam (~500 orders/month, 2-3 staff).

Built on **AppSheet + Google Sheets + Apps Script**, schema fully in English. Vietnamese labels are used only in user-facing UI strings.

---

## 🚀 Quick Start

- **Open the prototype** — open `index.html` in any browser, or run `python3 -m http.server 8765` and visit `http://localhost:8765`.
- **Deploy to AppSheet** — follow [`BUILD_GUIDE.md`](BUILD_GUIDE.md) (Vietnamese, step-by-step, ~45 minutes total).

---

## 📂 Project Structure

```
Aura Rental/
├── index.html                        ← Mobile-first prototype (open in browser)
├── app.js                            ← App logic + localStorage persistence
├── styles.css                        ← Mobile-first stylesheet
│
├── CLAUDE.md                         ← AI assistant instructions
├── AGENTS.md                         ← Agent instructions (same content, diff agent)
├── APPSHEET_SYSTEM_BLUEPRINT.md      ← Documentation system blueprint
├── README.md                         ← This file
├── CHANGELOG.md                      ← Deployment history (date-based)
├── BUILD_GUIDE.md                    ← Step-by-step deploy guide (Vietnamese)
│
├── docs/
│   ├── project/
│   │   └── PRD.md                    ← Product Requirements Document
│   └── formulas/
│       ├── appsheet_formulas.md      ← AppSheet table schemas, virtual columns, slices, views, actions, format rules
│       ├── googlesheet_formulas.md   ← Google Sheets tab schemas
│       ├── appscript_code.md         ← Apps Script functions, triggers, installation
│       └── lookerstudio_formulas.md  ← (empty — not used)
│
└── AppsScript_AuraRental.gs          ← Paste into Google Sheets → Extensions → Apps Script
```

---

## 🎯 Core Features (in priority order)

1. **Check availability** — Calendar view with 5 color states (preparing / renting / returning / overdue / upcoming).
2. **Create order** — Multi-dress + multi-accessory order with customer info and deposit form.
3. **Process deposit refund** — Auto-calculate suggested deposit (50% or 100% of original price), auto-compute refund amount = cash − rental total − other costs.
4. **Track return status** — Visual timeline per order, click day in calendar to see all orders that day.

---

## 📊 Data Model (7 tables — AppSheet Core limit)

| # | Tab | Purpose | Rows/month |
|---|---|---|---|
| 1 | `orders` | Customer orders | ~500 |
| 2 | `order_dresses` | Junction: which dresses in which order | ~1000 (avg 2/order) |
| 3 | `dresses` | Dress inventory (120 dresses) | ~150 lifetime |
| 4 | `accessories` | Accessory inventory (bags, shoes, jewelry) | ~50 lifetime |
| 5 | `payments` | Deposit refund log | ~500 |
| 6 | `availability_checks` | NV check "is X free on date Y?" | low |
| 7 | `form_submissions` | Online form submissions (mirror) | ~200 |

**Total estimated rows after 1 year:** ~13,000 (within 5000/table if you archive quarterly, otherwise push to Core+ or Pro).

---

## 🛠 Tech Stack

| Layer | Tool | Why |
|---|---|---|
| Database | Google Sheets | Free, real-time sync, easy to inspect/edit |
| App UI | AppSheet (Core plan) | Free, mobile-friendly, no app store needed |
| Server logic | Google Apps Script | Auto-generate OrderId, cascade delete, snapshot |
| Calendar UI | AppSheet Calendar view | Built-in, native mobile support |

---

## 📖 Documentation Index

| File | Use it when |
|---|---|
| **[BUILD_GUIDE.md](BUILD_GUIDE.md)** | You want to deploy for the first time |
| **[docs/project/PRD.md](docs/project/PRD.md)** | You want to understand the product scope |
| **[docs/formulas/googlesheet_formulas.md](docs/formulas/googlesheet_formulas.md)** | You want to know which columns go in which tab |
| **[docs/formulas/appsheet_formulas.md](docs/formulas/appsheet_formulas.md)** | You want the exact AppSheet formula for a virtual column |
| **[docs/formulas/appscript_code.md](docs/formulas/appscript_code.md)** | You want to modify Apps Script behavior |
| **[APPSHEET_SYSTEM_BLUEPRINT.md](APPSHEET_SYSTEM_BLUEPRINT.md)** | You want to understand the documentation system |

---

## 🧪 Testing

After every change, run through the 10-item testing checklist in [`BUILD_GUIDE.md §6`](BUILD_GUIDE.md).

---

## 🔄 Maintenance

| When | Action |
|---|---|
| Add new dress | Open `dresses` tab in Sheets, or App → Dresses → + Add |
| Add new accessory | Open `accessories` tab, or App → Accessories → + Add |
| Process refund | App → Calendar → click order → Refund button |
| Check busy dates for 1 dress | App → Free? → pick dress + date |
| View cash ledger | App → Cash tab |

---

## 📜 License

Internal use only. © Aura Rental.

---

## 🙏 Acknowledgments

Built using the **AppSheet Documentation System Blueprint** (see `APPSHEET_SYSTEM_BLUEPRINT.md`).
