# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## 🎯 Project Overview

**Aura Rental** — Vietnamese dress rental shop management web app (~500 orders/month, managed by Phuong).

- **Type:** Single-file web app (index.html + styles.css + app.js)
- **Backend:** localStorage (with Google Sheets sync for multi-device)
- **Target:** Mobile-first, 50+ orders/day, real-time sync

## 🌍 Language & Localization

- **Response:** Vietnamese (tiếng Việt) unless user specifies otherwise
- **Code comments:** Tiếng Việt cho logic phức tạp, English cho generic
- **Dates:** ISO format (YYYY-MM-DD), display as DD/MM/YYYY (VN)

## 📅 Calendar Color System (CRITICAL)

| Status | Color | CSS Class | Meaning |
|--------|-------|-----------|---------|
| 🟢 Green | `#10b981` | `Chuan_Bi` | Pickup day (Ngày lấy) |
| 🟡 Orange | `#f59e0b` | `Dang_Thue` | Renting (Đang thuê) |
| 🔴 Red | `#ef4444` | `Tra_Ve` | Return day (Ngày trả) |
| ⚡ Amber | `#e67e22` | `Dang_Thue_12h` | 12h same-day rental |
| ⚪ Gray | `#6b7280` | `Qua_Han` | Overdue (Quá hạn) |
| 🔵 Blue | `#3b82f6` | `Sap_Toi` | Upcoming (Sắp tới) |

## 📐 Date Calculation Rules

```
ngayTraThuc(goi, lay):
  - '12h'      → lay (same day return)
  - '1 day'    → lay + 1
  - '3 days'   → lay + 2 (3 calendar cells: green → orange → red)

⚠️ CRITICAL: Use local date components (getFullYear/getMonth/getDate)
   DO NOT use toISOString().slice(0,10) — shifts dates by -1 in GMT+7
```

## 🔄 Booking Form Architecture

- **File:** `booking-form.html` - Customer-facing form
- **Flow:** Customer fills form → saves to localStorage → syncs to main app
- **Real-time:** Uses storage event listeners + polling to update dress/accessory list
- **Orders:** Prefixed with 'B' (e.g., 'B1751234567890')
- **Filter:** `curOrderFilter === 'new-booking'` shows booking-form orders

### Data Flow:
```
booking-form.html → localStorage('aura_bookings')
                           ↓
                    Sync to Google Sheets
                           ↓
                  Main app reads → converts to order
```

## 🔄 Google Sheets Sync Architecture

- **Script:** `AppsScript_SyncAPI.gs` (Web App, poll every 30s)
- **Setup guide:** `SYNC_SETUP.md`
- **Conflict resolution:** Latest `_ts` wins

## 🎨 UI/UX Guidelines

Inspired by Linear/Notion/Shopify:
- Clean, minimal design
- Soft shadows (0 4px 12px rgba)
- Border radius: 8-12px
- Accent: `#d4af37` (gold)
- Primary: `#1a1d2e` (dark blue)

## 📋 Order Types

```
['Chốt thuê', 'Fitting', 'Fitting xa', 'Đặt ship']
```

## 🛠️ Development Commands

```bash
# Start dev server
cd "/Users/nguyenhien/Hienrrr/Apps/Aura Rental" && python3 -m http.server 8765

# Clear localStorage (force re-seed)
localStorage.clear(); location.reload();

# Check data
db.don  // orders
db.vay  // dresses
db.pk   // accessories
```

## 🔧 File Structure

| File | Purpose |
|------|---------|
| `index.html` | Main app UI, modals |
| `app.js` | Logic, data, sync |
| `styles.css` | Styling |
| `booking-form.html` | Customer-facing form (shareable link) |
| `AppsScript_SyncAPI.gs` | Google Sheets sync |
| `SYNC_SETUP.md` | Setup guide |
| `manifest.json` | PWA manifest |
| `sw.js` | Service worker |

## 🧪 Testing Checklist

Before marking feature complete:
- [ ] Calendar shows correct colors (green/orange/red)
- [ ] Date doesn't shift incorrectly (test near midnight)
- [ ] Order filters work (all/today/week/preparing/renting/returning/overdue/refunded)
- [ ] CRUD on dresses/accessories
- [ ] Image upload works
- [ ] Sync indicator shows correct state

## 🚨 Known Traps

1. **Date shift bug:** `.toISOString()` returns UTC, not local time
2. **Migration:** Old data uses lowercase keys, new uses PascalCase
3. **Refund orders:** Must be excluded from calendar (hoan === true)

## 📚 Extended Thinking Guidelines

For **complex features**, use extended thinking:
```
think deeply → Architecture design, major refactors
think harder → Multi-component features, performance optimization
```

For **simple tasks** (bug fixes, small UI tweaks), standard reasoning is sufficient.

## 🔗 Related Documentation

- `SYNC_SETUP.md` — Google Sheets sync setup
- Memory: `aura-rental-app.md` — Project context
