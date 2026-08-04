#!/usr/bin/env python3
"""
bulk-import-dresses.py — Parse inventory.xlsx + replace dresses in Supabase.
Xoá hết váy cũ, insert lại từ file Excel.

Usage:
  python3 bulk-import-dresses.py
"""
import os
import sys
import json
import urllib.request

# ── Load .env ──────────────────────────────────────────────────────────────────
script_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(script_dir, '.env')
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k, _, v = line.partition('=')
                os.environ[k.strip()] = v.strip()

SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://mmiygzcljqayrfomxkkk.supabase.co')
KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')
XLSX_PATH = os.path.join(script_dir, 'inventory.xlsx')

print(f'🚀 Bulk-import-dresses')
print(f'   SUPABASE_URL: {SUPABASE_URL}')
print(f'   KEY loaded: {"✅" if KEY else "❌ MISSING"}')
print(f'   XLSX_PATH: {XLSX_PATH}')

if not KEY:
    print('❌ Thiếu SUPABASE_SERVICE_KEY trong file .env')
    sys.exit(1)

# ── Parse XLSX ─────────────────────────────────────────────────────────────────
try:
    import openpyxl
except ImportError:
    print('❌ openpyxl chưa được cài. Chạy: pip3 install openpyxl')
    sys.exit(1)

print(f'\n📊 Parsing: {XLSX_PATH}')
wb = openpyxl.load_workbook(XLSX_PATH, data_only=True)
ws = wb.active

rows = []
for row in ws.iter_rows(values_only=True):
    rows.append(row)

print(f'   Total rows in sheet: {len(rows)}')

# Column mapping: A=Tên váy, B=Size, C=Giá gốc, D=12h, E=1 ngày, F=3 ngày, G=Ghi chú
dresses = []
for i, row in enumerate(rows):
    if i == 0:  # skip header
        continue
    if not row:
        continue
    ten_vay = str(row[0]).strip() if row[0] else ''
    if not ten_vay or ten_vay.lower() in ('none', 'nan', ''):
        continue

    size = str(row[1]).strip() if len(row) > 1 and row[1] else ''
    goc_str = str(row[2]).strip() if len(row) > 2 and row[2] else '0'
    t12_str = str(row[3]).strip() if len(row) > 3 and row[3] else '0'
    t1_str = str(row[4]).strip() if len(row) > 4 and row[4] else '0'
    t3_str = str(row[5]).strip() if len(row) > 5 and row[5] else '0'
    ghi_chu = str(row[6]).strip() if len(row) > 6 and row[6] else ''

    def parse_price(s):
        s = str(s).replace('.', '').replace(',', '.').replace('đ', '').replace(' ', '').strip()
        try:
            return int(float(s))
        except:
            return 0

    dresses.append({
        'ten_vay': ten_vay.title(),
        'size': size,
        'gia_vay_goc': parse_price(goc_str),
        'gia_thue_12h': parse_price(t12_str),
        'gia_thue_1_ngay': parse_price(t1_str),
        'gia_thue_3_ngay': parse_price(t3_str),
        'ghi_chu': ghi_chu,
    })

print(f'   Valid dresses: {len(dresses)}')
print(f'\n📋 Preview (first 5):')
for j, d in enumerate(dresses[:5]):
    print(f'   {j+1}. {d["ten_vay"]} | {d["size"]} | gốc:{d["gia_vay_goc"]:,} | 12h:{d["gia_thue_12h"]:,} | 1d:{d["gia_thue_1_ngay"]:,} | 3d:{d["gia_thue_3_ngay"]:,}')
if len(dresses) > 5:
    print(f'   ... và {len(dresses) - 5} váy nữa')

# ── Supabase helpers ───────────────────────────────────────────────────────────
def sb_req(path, method='GET', body=None):
    url = f'{SUPABASE_URL}/rest/v1/{path}'
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('apikey', KEY)
    req.add_header('Authorization', f'Bearer {KEY}')
    req.add_header('Content-Type', 'application/json')
    if body:
        req.add_header('Prefer', 'return=minimal')
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read().decode() if resp.read() else ''
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode() if e.read() else ''

# ── Step 1: Fetch & delete existing dresses ────────────────────────────────────
print(f'\n🗑️  Xoá váy cũ trong Supabase...')

all_existing = []
offset = 0
while True:
    status, body = sb_req(f'dresses?select=id,ma_vay,ten_vay&limit=1000&offset={offset}')
    if status != 200:
        print(f'   ❌ Fetch failed ({status}): {body}')
        sys.exit(1)
    batch = json.loads(body) if body else []
    if not batch:
        break
    all_existing.extend(batch)
    print(f'   Trang {offset//1000+1}: +{len(batch)} = {len(all_existing)} tổng')
    if len(batch) < 1000:
        break
    offset += 1000

print(f'   Tìm thấy {len(all_existing)} váy cũ trong Supabase.')

if all_existing:
    for ex in all_existing:
        status, body = sb_req(f'dresses?id=eq.{ex["id"]}', method='DELETE')
        if status not in (200, 204, 404):
            print(f'   ❌ Xoá {ex.get("id","?")} thất bại ({status}): {body}')
    print(f'   ✅ Đã xoá {len(all_existing)} váy cũ.')
else:
    print(f'   ℹ️  Không có váy nào trong Supabase.')

# ── Step 2: Insert new dresses ─────────────────────────────────────────────────
print(f'\n📥 Inserting {len(dresses)} váy mới...')

insert_rows = []
for i, d in enumerate(dresses):
    insert_rows.append({
        'ma_vay': f'V{str(i+1).zfill(3)}',
        'ten_vay': d['ten_vay'],
        'size': d['size'],
        'gia_vay_goc': d['gia_vay_goc'],
        'gia_thue_12h': d['gia_thue_12h'],
        'gia_thue_1_ngay': d['gia_thue_1_ngay'],
        'gia_thue_3_ngay': d['gia_thue_3_ngay'],
        'ghi_chu': d['ghi_chu'],
        'anh_vay': None,
    })

status, body = sb_req('dresses', method='POST', body=insert_rows)
if status not in (200, 201):
    print(f'   ❌ Insert failed ({status}): {body}')
    sys.exit(1)
else:
    print(f'   ✅ Inserted {len(insert_rows)} váy.')

print(f'\n✅ Xong! Đã xoá {len(all_existing)} váy cũ, thêm {len(insert_rows)} váy mới.')
print(f'\n📋 Bước tiếp:')
print(f'   - Mở web app → hard refresh (Cmd+Shift+R) → tab Váy để verify')
