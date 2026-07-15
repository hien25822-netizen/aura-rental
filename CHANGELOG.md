# Changelog

All notable changes to Aura Rental are documented in this file.

## 2026-06-27 - Initial Build

- 7 tables (orders, order_dresses, dresses, accessories, payments, availability_checks, form_submissions)
- 5 slices for calendar filtering
- 9 views (Calendar, Orders, OrderDetail, RefundDeposit, CashLedger, Dresses, DressDetail, Accessories, AccessoryDetail)
- 5 format rules (Preparing/CurrentlyRenting/Returning/Overdue/Upcoming)
- 3 actions
- Apps Script v6 with setupTriggers, generateOrderId (LockService), cascade soft-delete, snapshot auto-fill
- Mobile-first prototype at index.html with localStorage persistence