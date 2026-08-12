# Plan: Aura Rental — 6 Fixes

## Context
User reported 3 groups of issues via screenshots:
1. Lịch tab type badge colors don't match Đơn tab, and no quick type-change on Lịch
2. (a) Note editing uses `prompt()` (single-line only); (b) Package badge wraps to 2 lines; (c) Multiple dress images not shown in order card; (d) No phone call button in order detail
3. Orders duplicated in Đơn tab

---

## Task 1 — Harmonize Lịch tab type badge colors + add type picker

**File: `styles.css`**

Update `.day-type-badge` color rules (currently at line ~1920) to match `.type-pill` colors:

| Loại | `.type-pill` (Đơn — correct) | `.day-type-badge` (Lịch — needs fix) |
|------|----------------------------|---------------------------------------|
| Chốt thuê | `#10b981` green | `#8b5cf6` violet → **keep green** |
| Fitting | `#f59e0b` amber | `#60a5fa` blue → **amber** |
| Fitting xa | `#ea580c` orange | `#059669` green → **orange** |
| Đặt ship | `#dc2626` red | `#dc2626` red → OK |
| Chờ xác nhận | `#38bdf8` sky | `#10b981` emerald → **sky** |

**File: `app.js`**

1. **`openTypePicker`** (line ~1188): Add `'Chờ xác nhận'` to the `types` array.

2. **`DayOrderCard`** (line ~1005): Find the `.day-type-badge` element in the card HTML and:
   - Add `data-type-btn` attribute to it
   - After building the card innerHTML, query it with `card.querySelector('[data-type-btn]')` and attach `click` → `openTypePicker(o)` (same pattern as `OrderCardListCard` line 1467-1473)

---

## Task 2a — Replace `prompt()` with textarea modal for note editing

**Files: `index.html`, `styles.css`, `app.js`**

1. **Add modal HTML** in `index.html` (near other modals, after `m-confirm`):
```html
<div class="modal" id="m-quick-note"><div class="sheet" id="qn-body"></div></div>
```

2. **Add CSS** in `styles.css`:
```css
.qn-textarea {
  width: 100%; min-height: 120px; resize: vertical;
  padding: 12px; border-radius: 8px; border: 1px solid var(--border);
  font-size: var(--text-sm); font-family: inherit;
  background: var(--surface); color: var(--text);
  box-sizing: border-box;
}
```

3. **Replace `openQuickNote`** in `app.js`:
   - Build `qn-body` innerHTML with the textarea pre-filled with current note
   - Show `m-quick-note` modal
   - On save: update `o.Ghi_Chu`, save, sync, refresh
   - On cancel: close modal

---

## Task 2b — Package badge single-line

**File: `styles.css`**

Update `.olc-badge` rule (around line 895): add `white-space: nowrap`:
```css
.olc-badge {
  /* existing rules */
  white-space: nowrap;
  flex-shrink: 0;
}
```

Also check `.day-card-badge` — add same if needed.

---

## Task 2c — Multiple dress images in order card

**File: `app.js` — `OrderCardListCard` (line 1412+)**

The card currently shows only one avatar circle. After the `<div class="olc-main-row">` structure, append a second row of images when `tenVay.length > 1`:

```js
// After the olc-main-row HTML, before the typeBtn click handler:
if (tenVay.length > 1) {
  const dhvs = o.dhvs || o.dresses || [];
  const extraImgs = document.createElement('div');
  extraImgs.className = 'olc-extra-imgs';
  extraImgs.style.cssText = 'display:flex;gap:4px;padding:0 12px 8px 48px;flex-wrap:wrap';
  dhvs.slice(1).forEach(item => {
    const v = vayById.get(item.vay || item.Ma_Vay);
    if (!v) return;
    const imgSrc = v.Anh_Vay || v.anh || '';
    const div = document.createElement('div');
    div.style.cssText = 'width:36px;height:36px;border-radius:6px;overflow:hidden;background:#f0f0f0;flex-shrink:0';
    if (imgSrc) {
      div.innerHTML = `<img src="${imgSrc}" style="width:100%;height:100%;object-fit:cover" alt="" />`;
    } else {
      div.textContent = (v.Ten_Vay || v.ten || '?')[0].toUpperCase();
      div.style.cssText += 'display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;color:#666';
    }
    extraImgs.appendChild(div);
  });
  card.appendChild(extraImgs);
}
```

---

## Task 2d — Phone call button in order detail

**File: `app.js` — `openOrderDetail`**

Find the phone number display (around line 2454-2457) and add a `tel:` link. Add CSS in `styles.css`:
```css
.call-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 50%;
  background: var(--accent); color: #fff; font-size: 12px;
  text-decoration: none; cursor: pointer;
  transition: opacity 0.2s;
}
.call-btn:hover { opacity: 0.85; }
```

---

## Task 3 — Fix order duplication in Đơn tab

**Root cause:** `renderOrders()` groups orders by `Ngay_Lay` (line 1373-1379) — each order pushed to exactly one `ordersByDate[dateKey]`. The render loop itself is clean. Likely cause: `db.don` has actual duplicate entries from Supabase sync returning duplicates.

**Fix — deduplicate at data level in `renderOrders()` (line 1307):**
```js
let arr = db.don.slice();
// Deduplicate by Ma_Don/id — keep first occurrence
const seen = new Set();
arr = arr.filter(o => {
  const key = o.Ma_Don || o.id || '';
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
```

If duplication persists after this, the root cause is in the sync layer and `supabase-app.js` needs investigation.

---

## Files to modify
- `styles.css` — badge colors (Task 1), `olc-badge` nowrap (Task 2b), call button CSS (Task 2d)
- `app.js` — `openTypePicker` types (Task 1), `DayOrderCard` type picker (Task 1), `openQuickNote` rewrite (Task 2a), `OrderCardListCard` extra images (Task 2c), `openOrderDetail` phone (Task 2d), `renderOrders` deduplicate (Task 3)
- `index.html` — add `m-quick-note` modal

## Verification
1. Calendar tab: badge colors match Đơn tab, tap badge → type picker appears
2. Add/edit note → textarea modal opens multi-line, save works
3. Order with 2+ dresses → extra images shown below first
4. Order detail modal → phone has call button, tapping opens phone dialer
5. Đơn tab → no duplicate orders shown
