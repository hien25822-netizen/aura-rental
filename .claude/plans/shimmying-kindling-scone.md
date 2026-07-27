# Plan: Fix Realtime Sync — UI Updates + Reset Behavior

## Context

**Vấn đề:** Khi đổi trạng thái đơn từ "Chờ xác nhận" → "Fitting" (dùng nút loại đơn trong order detail):
- Toast "Đã đổi loại đơn" hiện → function gốc `setOrderType` trong app.js chạy ✓
- UI **không thay đổi** → `renderCurrentView()` trong app.js không tồn tại → bị bỏ qua im lặng
- Reset về trạng thái CŨ → edit không được sync lên Supabase → Reset reload từ Supabase ghi đè bằng dữ liệu cũ

**Hai bug riêng biệt nhưng cùng hệ quả:**
1. `renderCurrentView()` không tồn tại → UI không cập nhật sau khi save
2. `setOrderType` wrapper check `order._dbId` → nếu order chưa có `_dbId`, không sync được → Reset mất edit

---

## Bug 1: `renderCurrentView()` là function không tồn tại

### Root cause
- `app.js` định nghĩa `refreshCurView()` (line ~2073) — function thật
- `app.js` gọi `renderCurrentView()` trong `setOrderType` (line ~912) — function **không tồn tại**
- Gọi function không tồn tại trong non-strict mode JS → bị bỏ qua im lặng (không throw error)
- → Toast hiện ✓ nhưng UI không re-render

### Fix
**Hai file cần sửa — cùng một bug (`renderCurrentView` → `refreshCurView`):**

1. **`app.js` line 912** — trong `setOrderType`:
   ```
   renderCurrentView() → refreshCurView()
   ```

2. **`supabase-app.js` lines 119, 307, 393, 463, 579** — 5 vị trí:
   ```
   renderCurrentView() → refreshCurView()
   ```
   (Dùng `replace_all: true` để thay tất cả một lần)

---

## Bug 2: `setOrderType` wrapper check `_dbId` → skip sync nếu missing

### Root cause
`supabase-app.js` lines 817-835 — wrapper `setOrderType`:
```javascript
const order = db.don.find(o => (o.Ma_Don || o.id) === id);
if (order && order._dbId) {  // ← SILENTLY SKIPS if no _dbId!
  await SupabaseService.updateOrder(order._dbId, order);
}
```

### Fix
Pattern giống `saveEditOrder` wrapper — nếu order không có `_dbId`, gọi `SupabaseService.createOrder()`:
```javascript
const order = db.don.find(o => (o.Ma_Don || o.id) === id);
if (order) {
  if (order._dbId) {
    await SupabaseService.updateOrder(order._dbId, order);
  } else {
    const sup = await SupabaseService.createOrder(order);
    order._dbId = sup._dbId;
    order.id = sup.id;
    localStorage.setItem(STORE, JSON.stringify(db));
  }
}
```

---

## Nút Reset — giữ nguyên không sửa

Theo yêu cầu user: Reset chỉ reload/re-sync, không clear dữ liệu. Đã fix ở commit trước (chỉ `removeItem('aura_v7')`, giữ Supabase auth).

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase-app.js` | Fix 1: `renderCurrentView` → `refreshCurView` (all occurrences) |
| `supabase-app.js` | Fix 2: `setOrderType` wrapper `_dbId` check → `createOrder` if missing |

---

## Verification

1. **Test realtime local (trên cùng trình duyệt):**
   - Mở order detail → đổi "Chờ xác nhận" → "Fitting"
   - ✅ Toast hiện + UI đơn list tự động đổi NGAY (không cần reset)
   - ✅ Mở modal detail → hiện đúng "Fitting"

2. **Test cross-device (nếu có thiết bị khác):**
   - Đổi trên máy A
   - ✅ Máy B tự cập nhật trong vài giây

3. **Test Reset:**
   - Sửa đơn (đổi A → B) → ấn Reset
   - ✅ Đơn vẫn giữ B (Reset chỉ reload từ Supabase, không mất edit)
