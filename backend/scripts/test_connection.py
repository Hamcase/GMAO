#!/usr/bin/env python3
"""
Quick test to verify Supabase connection before applying migration.
"""
import os
from supabase import create_client

# Get credentials from environment
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Missing Supabase credentials!")
    print("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.")
    exit(1)

print("🔌 Testing Supabase connection...")
print(f"URL: {SUPABASE_URL}")

try:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # Test query on existing tables
    result = supabase.table('accounts').select('id').limit(1).execute()
    
    print(f"✅ Connection successful!")
    print(f"✅ Can read from 'accounts' table")
    
    # Check which tables exist
    print("\n📋 Checking existing tables...")
    tables_to_check = ['assets', 'failure_modes', 'interventions', 'documents']
    for table in tables_to_check:
        try:
            result = supabase.table(table).select('id').limit(1).execute()
            print(f"  ✅ {table} exists")
        except Exception as e:
            print(f"  ⚠️  {table} not found or error: {e}")
    
    print("\n✅ Pre-migration check complete. Ready to apply migration.")
    
except Exception as e:
    print(f"❌ Connection failed: {e}")
    exit(1)
