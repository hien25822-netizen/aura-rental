# 🌐 Hướng dẫn Deploy Aura Rental

## Cách nhanh nhất: Dùng Local Network

### Bước 1: Tìm IP máy của bạn
```bash
# macOS:
ipconfig getifaddr en0
# Kết quả ví dụ: 192.168.1.100
```

### Bước 2: Start Server
```bash
cd "/Users/nguyenhien/Hienrrr/Apps/Aura Rental"
python3 -m http.server 8080
```

### Bước 3: Chia sẻ URL
```
http://192.168.1.100:8080
```
*(Thay IP máy bạn)*

---

## Cách Pro: Netlify (Miễn phí)

### 1. Đăng ký Netlify
- Mở [app.netlify.com/drop](https://app.netlify.com/drop)
- Đăng nhập với GitHub/Email

### 2. Deploy
- Kéo thư mục `Aura Rental` vào ô "Drag and drop"
- Đợi deploy (~30 giây)

### 3. Get URL
- Netlify cấp URL: `https://random-name-12345.netlify.app`

---

## Kiểm tra sau Deploy

1. Mở URL trên điện thoại
2. Thử: Tạo đơn, Xem lịch, Tìm váy

---

## ⚠️ Lưu ý

- Data trong localStorage (trên máy)
- Google Sheets là backup tự động
- Mỗi thiết bị cần internet để sync
