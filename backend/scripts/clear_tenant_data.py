#!/usr/bin/env python3
"""
Clear all data for a tenant - fresh start
Removes work orders, KPIs, assets, technicians, spare parts, failure modes, and functions.

Usage:
    python clear_tenant_data.py --tenant-id <uuid> [--confirm]
"""

import argparse
import sys
import os
from dotenv import load_dotenv

load_dotenv()

try:
    from supabase import create_client, Client
except ImportError:
    print("ERROR: supabase not installed. Run: pip install supabase")
    sys.exit(1)

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL', '')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_KEY', '')

def init_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("Missing Supabase credentials")
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def clear_tenant_data(supabase: Client, tenant_id: str):
    """Delete all data for a tenant in proper order (respecting foreign keys)."""
    
    tables = [
        'part_usages',      # References work_orders and spare_parts
        'work_orders',      # References assets, technicians
        'asset_kpis',       # References assets (via asset_code)
        'failure_modes',    # References functions
        'functions',        # Base table
        'spare_parts',      # Base table
        'technicians',      # Base table
        'assets',           # Base table
    ]
    
    total_deleted = 0
    
    for table in tables:
        try:
            print(f"🗑️  Clearing {table}...", file=sys.stderr)
            result = supabase.table(table).delete().eq('tenant_id', tenant_id).execute()
            count = len(result.data) if result.data else 0
            print(f"   ✅ Deleted {count} rows from {table}", file=sys.stderr)
            total_deleted += count
        except Exception as e:
            print(f"   ⚠️  Error clearing {table}: {e}", file=sys.stderr)
    
    print(f"\n✅ Total: {total_deleted} rows deleted across all tables", file=sys.stderr)
    return total_deleted

def main():
    parser = argparse.ArgumentParser(description='Clear all data for a tenant')
    parser.add_argument('--tenant-id', required=True, help='Tenant UUID')
    parser.add_argument('--confirm', action='store_true', help='Confirm deletion (required)')
    
    args = parser.parse_args()
    
    if not args.confirm:
        print("⚠️  WARNING: This will delete ALL data for the tenant!")
        print("Run with --confirm flag to proceed.")
        sys.exit(1)
    
    print(f"🧹 Clearing all data for tenant: {args.tenant_id}", file=sys.stderr)
    
    try:
        supabase = init_supabase()
        deleted_count = clear_tenant_data(supabase, args.tenant_id)
        print(f"\n✅ Successfully cleared {deleted_count} records")
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
