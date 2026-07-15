-- ============================================================
-- AURA RENTAL — Supabase Database Schema v1
-- Run this in: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (staff accounts)
-- Extends Supabase Auth users
-- ============================================================
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  display_name text not null default 'Staff',
  role text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    'staff'  -- Default role; manually set owner in dashboard
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- DRESSES (Kho váy)
-- ============================================================
create table public.dresses (
  id uuid default uuid_generate_v4() primary key,
  ma_vay text unique not null,           -- e.g., "V001"
  ten_vay text not null,
  size text not null check (size in ('S', 'M', 'L', 'XL', 'Free size')),
  gia_vay_goc integer default 0,         -- VND
  gia_thue_12h integer default 0,
  gia_thue_1_ngay integer default 0,
  gia_thue_3_ngay integer default 0,
  anh_vay text,                          -- base64 or URL
  ghi_chu text default '',
  so_lan_thue integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  deleted_at timestamptz                 -- Soft delete
);

-- ============================================================
-- ACCESSORIES (Phụ kiện)
-- ============================================================
create table public.accessories (
  id uuid default uuid_generate_v4() primary key,
  ma_pk text unique not null,            -- e.g., "P001"
  ten_pk text not null,
  loai text not null check (loai in ('Giày', 'Túi', 'Dây chuyền', 'Khăn', 'Khác')),
  so_luong_tong integer default 1,
  gia_thue_12h integer default 0,
  gia_thue_1_ngay integer default 0,
  gia_thue_3_ngay integer default 0,
  anh_pk text,
  ghi_chu text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  deleted_at timestamptz
);

-- ============================================================
-- ORDERS (Đơn hàng)
-- ============================================================
create table public.orders (
  id uuid default uuid_generate_v4() primary key,
  ma_don text unique not null,          -- e.g., "A00001"
  trang_thai_don text default 'Chốt thuê' check (trang_thai_don in ('Chốt thuê', 'Fitting', 'Fitting xa', 'Đặt ship')),
  insta_khach text,
  sdt text,
  goi_thue text not null check (goi_thue in ('12h', '1 ngày', '3 ngày')),
  ngay_lay date not null,
  gio_lay text default '09:00',
  ngay_tra date not null,
  hinh_thuc_coc text,
  hinh_thuc_nhan text,
  dia_chi text default '',
  su_kien text default '',
  ghi_chu text default '',
  chi_phi_khac integer default 0,
  trang_thai_hoan_coc boolean default false,
  thoi_gian_hoan_coc timestamptz,
  ngay_tao timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  deleted_at timestamptz
);

-- ============================================================
-- ORDER-DRESS RELATIONS (Đơn hàng - Váy)
-- ============================================================
create table public.order_dresses (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  dress_id uuid not null references public.dresses(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ORDER-ACCESSORY RELATIONS (Đơn hàng - Phụ kiện)
-- ============================================================
create table public.order_accessories (
  id uuid default uuid_generate_v4() primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  accessory_id uuid not null references public.accessories(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- ============================================================
-- PAYMENTS (Thanh toán)
-- ============================================================
create table public.payments (
  id uuid default uuid_generate_v4() primary key,
  ma_tt text unique not null,
  order_id uuid references public.orders(id) on delete set null,
  ngay_tt date,
  tien_coc integer default 0,
  chi_phi_khac integer default 0,
  ghi_chu text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- BOOKINGS (từ booking-form.html)
-- ============================================================
create table public.bookings (
  id uuid default uuid_generate_v4() primary key,
  ma_booking text unique not null,      -- e.g., "B1751234567890"
  insta_khach text,
  sdt text,
  goi_thue text,
  ngay_lay date,
  gio_lay text,
  ngay_tra date,
  hinh_thuc_nhan text,
  hinh_thuc_coc text,
  dia_chi text,
  su_kien text,
  ghi_chu text,
  chi_phi_khac integer default 0,
  trang_thai text default 'Chờ xác nhận' check (trang_thai in ('Chờ xác nhận', 'confirmed', 'cancelled')),
  converted_order_id uuid references public.orders(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Booking-Dress relations
create table public.booking_dresses (
  id uuid default uuid_generate_v4() primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  dress_id uuid not null references public.dresses(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Booking-Accessory relations
create table public.booking_accessories (
  id uuid default uuid_generate_v4() primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  accessory_id uuid not null references public.accessories(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES for performance
-- ============================================================
create index idx_orders_ngay_lay on public.orders(ngay_lay);
create index idx_orders_ngay_tra on public.orders(ngay_tra);
create index idx_orders_deleted on public.orders(deleted_at) where deleted_at is null;
create index idx_order_dresses_order on public.order_dresses(order_id);
create index idx_order_dresses_dress on public.order_dresses(dress_id);
create index idx_order_accessories_order on public.order_accessories(order_id);
create index idx_order_accessories_accessory on public.order_accessories(accessory_id);
create index idx_bookings_status on public.bookings(trang_thai);
create index idx_booking_dresses_booking on public.booking_dresses(booking_id);
create index idx_booking_dresses_dress on public.booking_dresses(dress_id);
create index idx_booking_accessories_booking on public.booking_accessories(booking_id);
create index idx_booking_accessories_accessory on public.booking_accessories(accessory_id);
create index idx_dresses_deleted on public.dresses(deleted_at) where deleted_at is null;
create index idx_accessories_deleted on public.accessories(deleted_at) where deleted_at is null;

-- ============================================================
-- UPDATED_AT trigger function
-- ============================================================
create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply triggers to all tables
create trigger dresses_updated_at before update on public.dresses
  for each row execute procedure public.update_updated_at_column();

create trigger accessories_updated_at before update on public.accessories
  for each row execute procedure public.update_updated_at_column();

create trigger orders_updated_at before update on public.orders
  for each row execute procedure public.update_updated_at_column();

create trigger payments_updated_at before update on public.payments
  for each row execute procedure public.update_updated_at_column();

create trigger profiles_updated_at before update on public.profiles
  for each row execute procedure public.update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.dresses enable row level security;
alter table public.accessories enable row level security;
alter table public.orders enable row level security;
alter table public.order_dresses enable row level security;
alter table public.order_accessories enable row level security;
alter table public.payments enable row level security;
alter table public.bookings enable row level security;

-- Profiles: users can read all, update only their own
create policy "Profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Dresses: all authenticated users can read/write
create policy "Dresses are viewable by authenticated users"
  on public.dresses for select
  to authenticated
  using (deleted_at is null);

create policy "Authenticated users can manage dresses"
  on public.dresses for all
  to authenticated
  using (deleted_at is null);

-- Same for accessories
create policy "Accessories are viewable by authenticated users"
  on public.accessories for select
  to authenticated
  using (deleted_at is null);

create policy "Authenticated users can manage accessories"
  on public.accessories for all
  to authenticated
  using (deleted_at is null);

-- Orders: all authenticated users can read/write
create policy "Orders are viewable by authenticated users"
  on public.orders for select
  to authenticated
  using (deleted_at is null);

create policy "Authenticated users can manage orders"
  on public.orders for all
  to authenticated
  using (deleted_at is null);

-- Order-dress relations
create policy "Order dresses are viewable by authenticated users"
  on public.order_dresses for select
  to authenticated
  using (true);

create policy "Authenticated users can manage order dresses"
  on public.order_dresses for all
  to authenticated
  using (true);

-- Order-accessory relations
create policy "Order accessories are viewable by authenticated users"
  on public.order_accessories for select
  to authenticated
  using (true);

create policy "Authenticated users can manage order accessories"
  on public.order_accessories for all
  to authenticated
  using (true);

-- Payments: all authenticated users can read/write
create policy "Payments are viewable by authenticated users"
  on public.payments for select
  to authenticated
  using (true);

create policy "Authenticated users can manage payments"
  on public.payments for all
  to authenticated
  using (true);

-- Bookings: anyone can create (for booking form), auth for management
create policy "Bookings are viewable by authenticated users"
  on public.bookings for select
  to authenticated
  using (true);

-- PUBLIC INSERT: Customers can create bookings without login
create policy "Anyone can create bookings"
  on public.bookings for insert
  to public
  with check (true);

create policy "Authenticated users can update bookings"
  on public.bookings for update
  to authenticated
  using (true);

-- Booking-dress relations
create policy "Booking dresses are viewable by authenticated users"
  on public.booking_dresses for select
  to authenticated
  using (true);

create policy "Authenticated users can manage booking dresses"
  on public.booking_dresses for all
  to authenticated
  using (true);

-- Booking-accessory relations
create policy "Booking accessories are viewable by authenticated users"
  on public.booking_accessories for select
  to authenticated
  using (true);

create policy "Authenticated users can manage booking accessories"
  on public.booking_accessories for all
  to authenticated
  using (true);

-- ============================================================
-- REALTIME subscriptions
-- Run these in SQL Editor AFTER creating tables
-- Dashboard > Database > Replication > Enable for each table
-- Or use these SQL commands:
-- ============================================================
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_dresses;
alter publication supabase_realtime add table public.order_accessories;
alter publication supabase_realtime add table public.dresses;
alter publication supabase_realtime add table public.accessories;
alter publication supabase_realtime add table public.payments;
alter publication supabase_realtime add table public.bookings;
alter publication supabase_realtime add table public.booking_dresses;
alter publication supabase_realtime add table public.booking_accessories;

-- ============================================================
-- DONE!
-- Next steps:
-- 1. Go to Authentication > Providers > Enable Email
-- 2. Go to Authentication > URL Configuration > Add your app URL
-- 3. Create user accounts via Authentication > Users > Invite
-- ============================================================
