#!/usr/bin/env python3
"""
Quick delta test: Insert one more corrective work order and verify MTBF decreases or failure_count increases.
Requires environment variables NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
"""
import os
from datetime import datetime, timedelta
from supabase import create_client

url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
client = create_client(url, key)

# Get existing test asset
assets = client.table('assets').select('id,name').like('name', '%Compresseur A1 TEST%').execute().data
if not assets:
    print('❌ Test asset not found. Run insert_test_data.py first.')
    exit(1)
asset_id = assets[0]['id']

# Fetch current KPI view row
kpi_rows = client.from_('view_asset_kpis').select('*').eq('asset_id', asset_id).execute().data
if not kpi_rows:
    print('❌ No KPI row found.')
    exit(1)
old = kpi_rows[0]
print(f"Before: failures={old['failure_count']} MTBF={old.get('mtbf_hours')} MTTR={old.get('mttr_hours')}")

# Create new technician if needed
techs = client.table('technicians').select('id').limit(1).execute().data
tech_id = techs[0]['id'] if techs else None

now = datetime.utcnow()
start = now - timedelta(hours=3)
end = now - timedelta(hours=1)
wo_code = f"WO-DELTA-{int(now.timestamp())}"

new_wo = {
    'tenant_id': old['tenant_id'],
    'wo_code': wo_code,
    'asset_id': asset_id,
    'technician_id': tech_id,
    'start_at': start.isoformat()+"Z",
    'end_at': end.isoformat()+"Z",
    'downtime_minutes': 120,
    'type': 'corrective',
    'cause_text': 'Delta test failure',
    'description': 'Automated KPI delta test WO'
}

client.table('work_orders').insert(new_wo).execute()
print('✅ Inserted delta work order:', wo_code)

# Re-fetch KPI row
kpi_rows_after = client.from_('view_asset_kpis').select('*').eq('asset_id', asset_id).execute().data
newkpi = kpi_rows_after[0]
print(f"After: failures={newkpi['failure_count']} MTBF={newkpi.get('mtbf_hours')} MTTR={newkpi.get('mttr_hours')}")

if newkpi['failure_count'] == old['failure_count'] + 1:
    print('✅ Failure count incremented correctly.')
else:
    print('❌ Failure count did not increment as expected.')
