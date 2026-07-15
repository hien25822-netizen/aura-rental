# ⚡ BUILD STEPS - Quick Reference

## 4 BƯỚC CHÍNH (Tổng ~15 phút)

---

### BƯỚC 1: Deploy Web App (3 phút)

```bash
# 1.1 Chạy local để test
cd "/Users/nguyenhien/Hienrrr/Apps/Aura Rental"
python3 -m http.server 8765
open http://localhost:8765

# 1.2 Deploy lên Netlify
# - Mở: https://app.netlify.com/drop
# - Kéo thư mục vào
# - Copy URL
```

✅ Done khi thấy calendar hiển thị

---

### BƯỚC 2: Tạo Google Sheets (5 phút)

```
1. Tạo spreadsheet "Aura Rental Database"
2. Tạo 7 tabs: DON_HANG, DON_HANG_VAY, KHO_VAY, PHU_KIEN, THANH_TOAN, FORM, SYNC_LOG
3. Paste headers vào mỗi tab A1
   (Headers có sẵn trong file BABY_STEPS_GUIDE.md)
```

✅ Done khi thấy 7 tabs với headers

---

### BƯỚC 3: Deploy Apps Script (3 phút)

```
1. Sheets → Extensions → Apps Script
2. Paste code từ file AppsScript_SyncAPI.gs
3. Deploy → Web app → Anyone → Deploy
4. Copy Web App URL
```

✅ Done khi có URL: `https://script.google.com/macros/s/XXX/exec`

---

### BƯỚC 4: Connect App + Share Form (4 phút)

```
1. Sửa app.js: WEB_APP_URL = 'URL vừa copy'
2. Re-deploy lên Netlify
3. Test: Tạo đơn mới → Check Google Sheets
4. Share: xxx.netlify.app/booking-form.html cho khách
```

✅ Done khi sync hoạt động

---

## 🎯 KẾT QUẢ

| Component | URL |
|-----------|-----|
| App chính | `https://xxx.netlify.app` |
| Booking form | `https://xxx.netlify.app/booking-form.html` |
| Google Sheets | `https://docs.google.com/spreadsheets/d/XXX` |

---

## 💡 DEBUG NHANH

| Vấn đề | Cách sửa |
|--------|----------|
| App không load | Check `index.html` tồn tại |
| Sync lỗi | Check `SYNC_LOG` tab |
| Form không gửi được | Mở Console (F12) xem lỗi |
| Váy mới không hiện | Refresh form (F5) |

---

## 📞 NEXT STEPS

- Cài app lên điện thoại (Add to Home Screen)
- Share link cho nhân viên
- Share booking form cho khách qua Zalo
- Backup data hàng tuần