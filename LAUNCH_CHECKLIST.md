# 🚀 Aura Rental - Launch Checklist
**Ngày dự kiến: Thứ Hai, 07/07/2026**

---

## ✅ Trước khi Launch (Tối nay)

### 1. Backup Data
```bash
# Export localStorage (chạy trong browser console)
JSON.stringify(localStorage.getItem('aura_v7'))
# Copy output → paste vào Google Sheets hoặc file backup
```

### 2. Verify Sync
- [ ] Mở app → kiểm tra góc trên cùng
  - Nếu hiển thị "🔄 Online" → Sync đang hoạt động ✅
  - Nếu hiển thị "⚠️ Offline" → Kiểm tra mạng

### 3. Test trên Mobile
- [ ] iPhone: Safari → mở URL → Add to Home Screen
- [ ] Android: Chrome → mở URL → Add to Home Screen
- [ ] Kiểm tra PWA icon xuất hiện

### 4. Danh sách nhân viên được chia sẻ
- [ ] Phuong (chủ shop) - Full access
- [ ] [Tên nhân viên 1] - Access: Đơn hàng, Lịch
- [ ] [Tên nhân viên 2] - Access: Đơn hàng, Lịch

---

## 📱 Cách nhân viên Install App

### iPhone/iPad:
1. Mở Safari → truy cập URL app
2. Tap nút Share (⬆️)
3. Chọn "Add to Home Screen"
4. Đặt tên: "Aura Rental"
5. Tap "Add"

### Android:
1. Mở Chrome → truy cập URL app
2. Tap menu (⋮)
3. Chọn "Add to Home Screen"
4. Đặt tên: "Aura Rental"
5. Tap "Add"

---

## 🌐 Deploy Options (Chọn 1)

### Option A: Local Network (Miễn phí - Khuyến nghị cho test)
```bash
# Chạy trên máy của Phuong 24/7
cd "/Users/nguyenhien/Hienrrr/Apps/Aura Rental"
python3 -m http.server 8080

# Truy cập từ các thiết bị:
# - iPhone/Android: http://[IP_MAY_PHƯƠNG]:8080
```

### Option B: GitHub Pages (Miễn phí - Khuyến nghị)
1. Tạo repo GitHub: `aura-rental`
2. Push code lên main branch
3. Enable GitHub Pages
4. URL: `https://[username].github.io/aura-rental`

### Option C: Netlify/Vercel (Miễn phí - Pro)
1. Drag folder `Aura Rental` lên [netlify.com](https://netlify.com)
2. Hoặc connect GitHub repo
3. Deploy tự động

### Option D: Hosting trả phí (Chuyên nghiệp)
- VPS: DigitalOcean, Linode
- Shared Hosting: Hostinger, Bluehost

---

## 🔧 Troubleshooting thường gặp

### "App không sync"
1. Kiểm tra mạng internet
2. Kiểm tra Google Sheets có access không
3. Restart app (refresh trang)

### "Add to Home Screen không hoạt động"
- iOS: Phải dùng Safari, không dùng Chrome
- Android: Chrome/Edge hoạt động tốt nhất

### "Dữ liệu bị mất"
- App dùng localStorage → data nằm trên máy
- Google Sheets là backup
- Nếu cần reset: localStorage.clear() → app sẽ tự đồng bộ từ Sheets

---

## 📞 Support

- **Phuong**: 0912.xxx.xxx
- **Technical**: Claude Code

---

## ✅ Post-Launch (Sau khi launch)

### Ngày 1:
- [ ] Confirm nhân viên có thể truy cập app
- [ ] Confirm sync hoạt động giữa các thiết bị
- [ ] Monitor lỗi nếu có

### Ngày 2-7:
- [ ] Thu thập feedback từ nhân viên
- [ ] Fix bugs nếu có
- [ ] Cập nhật feature nếu cần

### Hàng tuần:
- [ ] Backup Google Sheets
- [ ] Check sync logs
