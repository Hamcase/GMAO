#!/usr/bin/env python3
"""
Vérifier si des données existent déjà dans Supabase.
"""
import os
from supabase import create_client

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Missing Supabase credentials!")
    exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

print("🔍 Checking Supabase for existing data...\n")

# Check each table
tables = {
    'assets': 'Équipements',
    'technicians': 'Techniciens',
    'work_orders': 'Ordres de travail',
    'spare_parts': 'Pièces de rechange',
    'failure_modes': 'Modes de défaillance',
    'actions': 'Actions AMDEC',
}

has_data = False

for table, label in tables.items():
    try:
        result = supabase.table(table).select('id').limit(10).execute()
        count = len(result.data) if result.data else 0
        
        if count > 0:
            has_data = True
            print(f"✅ {label} ({table}): {count} row(s)")
        else:
            print(f"⚠️  {label} ({table}): EMPTY")
    except Exception as e:
        print(f"❌ {label} ({table}): ERROR - {str(e)[:50]}")

print("\n" + "="*60)

if has_data:
    print("✅ VOUS AVEZ DÉJÀ DES DONNÉES dans Supabase")
    print("   → Je peux brancher directement Dashboard/AMDEC/PDR")
else:
    print("⚠️  AUCUNE DONNÉE trouvée dans Supabase")
    print("   → Il faut d'abord importer Data_P avec l'Upload page")

print("="*60)

# Check views
print("\n🔍 Checking computed views...")
views = ['view_asset_kpis', 'view_technician_workload', 'view_reorder_status']

for view in views:
    try:
        result = supabase.from_(view).select('*').limit(3).execute()
        count = len(result.data) if result.data else 0
        print(f"   {view}: {count} row(s)")
    except Exception as e:
        print(f"   {view}: ERROR - {str(e)[:50]}")
