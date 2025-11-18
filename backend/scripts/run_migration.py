#!/usr/bin/env python3
"""Run a SQL migration file on Supabase."""
import sys
import os
from pathlib import Path
from supabase import create_client
from dotenv import load_dotenv

# Load env from web app
env_path = Path(__file__).parent.parent.parent / 'apps' / 'web' / '.env.local'
load_dotenv(env_path)

supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')

if not supabase_url or not supabase_key:
    print("ERROR: Missing SUPABASE env vars")
    sys.exit(1)

# Read migration file
migration_file = sys.argv[1] if len(sys.argv) > 1 else None
if not migration_file:
    print("Usage: python run_migration.py <migration.sql>")
    sys.exit(1)

with open(migration_file, 'r', encoding='utf-8') as f:
    sql = f.read()

# Split into statements and execute one by one
statements = [s.strip() for s in sql.split(';') if s.strip() and not s.strip().startswith('--')]

supabase = create_client(supabase_url, supabase_key)

print(f"Running migration: {migration_file}")
print(f"Found {len(statements)} SQL statements")

for i, stmt in enumerate(statements, 1):
    if stmt.startswith('DO $$'):
        # Handle DO blocks (can't split by semicolon easily)
        print(f"  [{i}] Skipping DO block (run manually)")
        continue
    
    try:
        print(f"  [{i}] {stmt[:60]}...")
        # Use raw SQL execution via PostgREST
        response = supabase.postgrest.session.post(
            f"{supabase_url}/rest/v1/rpc/exec_sql",
            json={"sql": stmt},
            headers={"apikey": supabase_key, "Authorization": f"Bearer {supabase_key}"}
        )
        if response.status_code >= 400:
            print(f"    ⚠️ Error: {response.text}")
        else:
            print(f"    ✅")
    except Exception as e:
        print(f"    ⚠️ Error: {e}")

print("\n✅ Migration completed (check for errors above)")
