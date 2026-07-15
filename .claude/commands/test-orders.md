---
description: Test orders CRUD and sync
---

Test orders functionality:

1. **Create order:**
   - Fill all required fields
   - Select dresses and accessories
   - Verify Ngay_Tra auto-calculates correctly

2. **Order filters:**
   - Tất cả: All non-refunded orders
   - Hôm nay: Orders where Ngay_Lay or Ngay_Tra = today
   - Tuần này: Next 7 days
   - Cần lấy (Chuan_Bi): Status = pickup today
   - Đang thuê (Dang_Thue): In rental period
   - Trả hôm nay (Tra_Ve): Ngay_Tra = today
   - Quá hạn (Qua_Han): Ngay_Tra < today and not returned
   - Đã hoàn: hoan === true

3. **Order types:**
   - Chốt thuê
   - Fitting
   - Fitting xa
   - Đặt ship

4. **Edit order:**
   - Modify all fields
   - Change dresses/accessories
   - Verify changes persist after reload

5. **Refund flow:**
   - Calculate refund correctly
   - Mark order as hoan
   - Verify appears in "Đã hoàn" filter

6. **Sync (if configured):**
   - Create order → verify appears in Google Sheets
   - Edit in Sheets → verify syncs back
   - Conflict resolution (later _ts wins)
