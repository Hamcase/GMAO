#!/usr/bin/env python3
"""
Verify migration was applied successfully.
"""
import os
from supabase import create_client

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("🔍 Verifying migration...")

# Check new tables
new_tables = [
    'technicians',
    'spare_parts', 
    'work_orders',
    'part_usages',
    'stock_movements',
    'functions',
    'failure_effects',
    'actions'
]

print("\n📦 Checking new tables:")
for table in new_tables:
    try:
        result = supabase.table(table).select('id').limit(1).execute()
        print(f"  ✅ {table}")
    except Exception as e:
        print(f"  ❌ {table} - {e}")

# Check views (using raw SQL)
views = [
    'view_asset_kpis',
    'view_technician_workload',
    'view_reorder_status',
    'view_part_demand',
    'view_failure_frequencies'
]

print("\n📊 Checking views:")
for view in views:
    try:
        result = supabase.rpc('pg_class', {}).execute()
        # Simple check: try to query the view
        result = supabase.from_(view).select('*').limit(1).execute()
        print(f"  ✅ {view}")
    except Exception as e:
        print(f"  ⚠️  {view} - Will check via query...")
        # Views might be empty, that's OK
        try:
            supabase.from_(view).select('*').limit(1).execute()
            print(f"    ✅ {view} exists (no data yet)")
        except:
            print(f"    ❌ {view} not found")

print("\n✅ Migration verification complete!")
