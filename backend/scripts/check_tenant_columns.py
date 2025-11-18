#!/usr/bin/env python3
"""Quick fix: Add tenant_id to functions and failure_modes tables."""
import sys
import os
from pathlib import Path
from supabase import create_client
from dotenv import load_dotenv

env_path = Path(__file__).parent.parent.parent / 'apps' / 'web' / '.env.local'
load_dotenv(env_path)

supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not supabase_url or not supabase_key:
    print("ERROR: Missing SUPABASE env vars")
    sys.exit(1)

supabase = create_client(supabase_url, supabase_key)

# Get first tenant_id from assets
result = supabase.table('assets').select('tenant_id').limit(1).execute()
if not result.data:
    print("ERROR: No assets found to get tenant_id from")
    sys.exit(1)

tenant_id = result.data[0]['tenant_id']
print(f"✅ Found tenant_id: {tenant_id}")

# Check if functions table has tenant_id column
try:
    result = supabase.table('functions').select('id,tenant_id').limit(1).execute()
    print("✅ functions table already has tenant_id column")
except Exception as e:
    print(f"⚠️ functions table missing tenant_id: {e}")
    print("   → Please run this SQL in Supabase dashboard:")
    print("   ALTER TABLE functions ADD COLUMN tenant_id UUID;")
    print("   CREATE INDEX idx_functions_tenant_id ON functions(tenant_id);")

# Check if failure_modes table has tenant_id column
try:
    result = supabase.table('failure_modes').select('id,tenant_id').limit(1).execute()
    print("✅ failure_modes table already has tenant_id column")
except Exception as e:
    print(f"⚠️ failure_modes table missing tenant_id: {e}")
    print("   → Please run this SQL in Supabase dashboard:")
    print("   ALTER TABLE failure_modes ADD COLUMN tenant_id UUID;")
    print("   CREATE INDEX idx_failure_modes_tenant_id ON failure_modes(tenant_id);")

print("\n📋 After adding columns, run this to backfill existing data:")
print(f"   UPDATE functions SET tenant_id = '{tenant_id}' WHERE tenant_id IS NULL;")
print(f"   UPDATE failure_modes SET tenant_id = '{tenant_id}' WHERE tenant_id IS NULL;")
