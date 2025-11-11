#!/usr/bin/env python3
"""
Insert sample test data to verify the pipeline works.
"""
import os
from datetime import datetime, timedelta
from supabase import create_client

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Use your actual tenant_id (get it from accounts table)
result = supabase.table('accounts').select('id').limit(1).execute()
TENANT_ID = result.data[0]['id'] if result.data else None

if not TENANT_ID:
    print("❌ No tenant found in accounts table")
    exit(1)

print(f"🔑 Using tenant_id: {TENANT_ID}")

# 1. Create test asset
print("\n1️⃣ Creating test asset...")
asset_result = supabase.table('assets').insert({
    'tenant_id': TENANT_ID,
    'name': 'Compresseur A1 TEST',
    'type': 'compressor'
}).execute()
asset_id = asset_result.data[0]['id']
print(f"✅ Asset created: {asset_id}")

# 2. Create test technician
print("\n2️⃣ Creating test technician...")
tech_result = supabase.table('technicians').insert({
    'tenant_id': TENANT_ID,
    'name': 'Jean Dupont',
    'skills': ['electrical', 'mechanical']
}).execute()
tech_id = tech_result.data[0]['id']
print(f"✅ Technician created: {tech_id}")

# 3. Create test spare part
print("\n3️⃣ Creating test spare part...")
part_result = supabase.table('spare_parts').insert({
    'tenant_id': TENANT_ID,
    'sku': 'BEARING-001',
    'name': 'Roulement SKF 6205',
    'stock_on_hand': 15,
    'safety_stock': 5,
    'reorder_point': 10,
    'unit_cost': 25.50
}).execute()
part_id = part_result.data[0]['id']
print(f"✅ Spare part created: {part_id}")

# 4. Create test work orders (3 failures over last month)
print("\n4️⃣ Creating test work orders...")
now = datetime.now()
for i in range(3):
    days_ago = 30 - (i * 10)  # 30, 20, 10 days ago
    start = now - timedelta(days=days_ago, hours=2)
    end = start + timedelta(hours=2, minutes=30)
    
    wo_result = supabase.table('work_orders').insert({
        'tenant_id': TENANT_ID,
        'wo_code': f'WO-TEST-{i+1}',
        'asset_id': asset_id,
        'technician_id': tech_id,
        'start_at': start.isoformat(),
        'end_at': end.isoformat(),
        'downtime_minutes': 150,  # 2.5 hours
        'type': 'corrective',
        'cause_text': f'Test failure {i+1}',
        'description': f'Test repair work order #{i+1}'
    }).execute()
    wo_id = wo_result.data[0]['id']
    
    # Add part usage
    supabase.table('part_usages').insert({
        'work_order_id': wo_id,
        'part_id': part_id,
        'quantity': 1
    }).execute()
    
    print(f"  ✅ WO-TEST-{i+1} created with part usage")

# 5. Verify views are populated
print("\n5️⃣ Verifying computed views...")

# Check asset KPIs
kpi_result = supabase.from_('view_asset_kpis').select('*').eq('asset_id', asset_id).execute()
if kpi_result.data:
    kpi = kpi_result.data[0]
    print(f"\n📊 Asset KPIs:")
    print(f"  MTBF: {kpi.get('mtbf_hours', 'N/A')} hours")
    print(f"  MTTR: {kpi.get('mttr_hours', 'N/A')} hours")
    print(f"  Availability: {kpi.get('availability_pct', 'N/A')}%")
    print(f"  Failures: {kpi.get('failure_count', 0)}")
else:
    print("  ⚠️ No KPI data yet (views need work orders with end dates)")

# Check technician workload
workload_result = supabase.from_('view_technician_workload').select('*').eq('technician_id', tech_id).execute()
if workload_result.data:
    wl = workload_result.data[0]
    print(f"\n👷 Technician Workload:")
    print(f"  Completed: {wl.get('completed', 0)}")
    print(f"  In Progress: {wl.get('in_progress', 0)}")
    print(f"  Utilization: {wl.get('utilization_pct', 0)}%")

# Check reorder status
reorder_result = supabase.from_('view_reorder_status').select('*').eq('part_id', part_id).execute()
if reorder_result.data:
    ro = reorder_result.data[0]
    print(f"\n📦 Reorder Status:")
    print(f"  Part: {ro.get('name')}")
    print(f"  Stock: {ro.get('stock_on_hand')} (safety: {ro.get('safety_stock')})")
    print(f"  Status: {ro.get('status')}")
    print(f"  Days to stockout: {ro.get('days_to_stockout', 'N/A')}")

print("\n✅ Test data created successfully!")
print(f"\n🎯 You can now:")
print(f"  1. Navigate to /home/dashboard - Should show real KPIs")
print(f"  2. Navigate to /home/pdr - Should show reorder alert")
print(f"  3. Check Supabase dashboard to see the data")
