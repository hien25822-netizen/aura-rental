# Plan: Fix Realtime Sync — Orders không tự cập nhật

## Context

**Bug**: Khi thay đổi thông tin đơn hàng trên Supabase, app không tự động cập nhật UI — phải Cmd+Shift+R refresh thủ công.

**Root cause**: `setupRealtime()` trong `supabase-app.js` chỉ subscribe `dresses` và `accessories`, KHÔNG subscribe `orders`. `handleRealtimeOrderChange` đã tồn tại ở line 363 nhưng không bao giờ được gọi.

## Files to modify

- `supabase-app.js` — Thêm subscription cho orders trong `setupRealtime()`

## Implementation

Trong `setupRealtime()` (line 275), thêm subscribe cho orders:

```javascript
function setupRealtime() {
  if (!SupabaseService.isConfigured()) return;
  SupabaseService.unsubscribeAll();

  // Subscribe to dress changes
  SupabaseService.subscribeToChanges('dresses', payload => {
    handleRealtimeDressChange(payload);
  });

  // Subscribe to accessory changes
  SupabaseService.subscribeToChanges('accessories', payload => {
    handleRealtimeAccessoryChange(payload);
  });

  // ADD: Subscribe to order changes
  SupabaseService.subscribeToChanges('orders', payload => {
    handleRealtimeOrderChange(payload);
  });

  // Subscribe to booking changes
  SupabaseService.subscribeToChanges('bookings', payload => {
    handleRealtimeBookingChange(payload);
  });

  startBookingPolling();

  console.log('✅ Realtime subscriptions active');
}
```

`handleRealtimeOrderChange` (line 363) sẽ:
- Reload orders từ Supabase
- Update `db.don` trong localStorage
- Gọi `renderCurrentView()` nếu đang ở calendar/orders/avail view

## Verification

1. Login vào Supabase (nếu chưa login)
2. Tạo/sửa một order trong Supabase dashboard
3. Quan sát app — UI nên tự cập nhật trong vài giây mà không cần refresh
4. Kiểm tra console log: "Đơn hàng được cập nhật từ thiết bị khác"
