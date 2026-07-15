---
description: Test calendar colors and date logic
---

Test the calendar system thoroughly:

1. **Date shift bug fix:**
   - Check that dates near midnight (23:00-00:00) render correctly
   - Verify Ngay_Lay displays on correct calendar cell, not shifted by -1

2. **Color coding:**
   - 🟢 Green (Chuan_Bi): Only on Ngay_Lay
   - 🟡 Orange (Dang_Thue): Days between Ngay_Lay and Ngay_Tra
   - 🔴 Red (Tra_Ve): Only on Ngay_Tra
   - ⚡ Amber (Dang_Thue_12h): Only for '12h' packages on Ngay_Lay

3. **Package duration:**
   - 12h = 1 cell (green)
   - 1 day = 2 cells (green + red)
   - 3 days = 3 cells (green + orange + red)

4. **Refunded orders:**
   - Must NOT appear on calendar
   - Should be dimmed in order list

5. **Edge cases:**
   - Today = Ngay_Lay = Ngay_Tra (same day return)
   - Month boundary (e.g., lay: 28/06, tra: 02/07)
   - Leap year dates

Report findings with specific test dates.
