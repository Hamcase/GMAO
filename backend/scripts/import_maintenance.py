#!/usr/bin/env python3
"""
GMAO Maintenance Data ETL Script
Imports Excel maintenance data into Supabase database.

Expected Excel columns:
- asset_code: Unique asset identifier (e.g., "COMP-A1")
- wo_code: Work order code (e.g., "WO-2024-001")
- start_at: Start datetime (ISO 8601 or Excel datetime)
- end_at: End datetime (ISO 8601 or Excel datetime)
- type: corrective|preventive|emergency|improvement
- cause_text: Description of failure cause
- technician: Technician name (will create if not exists)
- part_sku: Spare part SKU (optional, for part_usages)
- quantity: Part quantity used (optional)

Usage:
    python import_maintenance.py --file data.xlsx --tenant-id <uuid>
"""

import argparse
import sys
import json
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd
from supabase import create_client, Client
import os

# Supabase connection
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')

def init_supabase() -> Client:
    """Initialize Supabase client."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError(
            "Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars."
        )
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def parse_datetime(value) -> datetime:
    """Parse datetime from various formats."""
    if pd.isna(value):
        return None
    
    if isinstance(value, datetime):
        # Ensure timezone-aware
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    
    # Try ISO 8601 format
    try:
        dt = datetime.fromisoformat(str(value))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        pass
    
    # Try common formats
    for fmt in ['%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%d/%m/%Y %H:%M', '%d/%m/%Y']:
        try:
            dt = datetime.strptime(str(value), fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    
    raise ValueError(f"Unable to parse datetime: {value}")

def upsert_assets(supabase: Client, df: pd.DataFrame, tenant_id: str) -> dict:
    """Upsert assets from DataFrame."""
    assets_map = {}
    unique_assets = df[['asset_code']].drop_duplicates()
    
    for _, row in unique_assets.iterrows():
        asset_code = row['asset_code']
        if pd.isna(asset_code):
            continue
        
        # Check if asset exists
        result = supabase.table('assets') \
            .select('id, name') \
            .eq('tenant_id', tenant_id) \
            .eq('name', asset_code) \
            .execute()
        
        if result.data:
            assets_map[asset_code] = result.data[0]['id']
        else:
            # Create new asset
            new_asset = {
                'tenant_id': tenant_id,
                'name': asset_code,
                'type': 'equipment',  # Default type
            }
            result = supabase.table('assets').insert(new_asset).execute()
            assets_map[asset_code] = result.data[0]['id']
    
    return assets_map

def upsert_technicians(supabase: Client, df: pd.DataFrame, tenant_id: str) -> dict:
    """Upsert technicians from DataFrame."""
    technicians_map = {}
    unique_techs = df[['technician']].drop_duplicates()
    
    for _, row in unique_techs.iterrows():
        tech_name = row['technician']
        if pd.isna(tech_name):
            continue
        
        # Check if technician exists
        result = supabase.table('technicians') \
            .select('id, name') \
            .eq('tenant_id', tenant_id) \
            .eq('name', tech_name) \
            .execute()
        
        if result.data:
            technicians_map[tech_name] = result.data[0]['id']
        else:
            # Create new technician
            new_tech = {
                'tenant_id': tenant_id,
                'name': tech_name,
                'skills': [],
            }
            result = supabase.table('technicians').insert(new_tech).execute()
            technicians_map[tech_name] = result.data[0]['id']
    
    return technicians_map

def upsert_spare_parts(supabase: Client, df: pd.DataFrame, tenant_id: str) -> dict:
    """Upsert spare parts from DataFrame."""
    parts_map = {}
    
    # Filter rows with part_sku
    parts_df = df[df['part_sku'].notna()][['part_sku']].drop_duplicates()
    
    for _, row in parts_df.iterrows():
        sku = row['part_sku']
        
        # Check if part exists
        result = supabase.table('spare_parts') \
            .select('id, sku') \
            .eq('tenant_id', tenant_id) \
            .eq('sku', sku) \
            .execute()
        
        if result.data:
            parts_map[sku] = result.data[0]['id']
        else:
            # Create new part with default values
            new_part = {
                'tenant_id': tenant_id,
                'sku': sku,
                'name': f'Part {sku}',  # Default name
                'stock_on_hand': 100,   # Default stock
                'safety_stock': 10,
                'reorder_point': 20,
                'lead_time_days': 7,
                'unit_cost': 0,
            }
            result = supabase.table('spare_parts').insert(new_part).execute()
            parts_map[sku] = result.data[0]['id']
    
    return parts_map

def insert_work_orders(
    supabase: Client,
    df: pd.DataFrame,
    tenant_id: str,
    assets_map: dict,
    technicians_map: dict
) -> list:
    """Insert work orders from DataFrame."""
    work_orders = []
    
    # Group by wo_code to avoid duplicates
    wo_groups = df.groupby('wo_code')
    
    for wo_code, group in wo_groups:
        if pd.isna(wo_code):
            continue
        
        # Take first row for work order details
        row = group.iloc[0]
        
        # Get foreign keys
        asset_id = assets_map.get(row['asset_code'])
        technician_id = technicians_map.get(row['technician'])
        
        if not asset_id:
            print(f"⚠️  Skipping WO {wo_code}: Unknown asset {row['asset_code']}")
            continue
        
        # Parse datetimes
        try:
            start_at = parse_datetime(row['start_at'])
            end_at = parse_datetime(row['end_at']) if not pd.isna(row['end_at']) else None
        except ValueError as e:
            print(f"⚠️  Skipping WO {wo_code}: {e}")
            continue
        
        # Calculate downtime in minutes
        downtime_minutes = None
        if start_at and end_at:
            downtime_minutes = int((end_at - start_at).total_seconds() / 60)
        
        # Check if work order exists
        result = supabase.table('work_orders') \
            .select('id') \
            .eq('tenant_id', tenant_id) \
            .eq('wo_code', wo_code) \
            .execute()
        
        if result.data:
            print(f"ℹ️  WO {wo_code} already exists, skipping")
            work_orders.append({'id': result.data[0]['id'], 'wo_code': wo_code})
            continue
        
        # Create work order
        wo_data = {
            'tenant_id': tenant_id,
            'wo_code': wo_code,
            'asset_id': asset_id,
            'technician_id': technician_id,
            'start_at': start_at.isoformat() if start_at else None,
            'end_at': end_at.isoformat() if end_at else None,
            'downtime_minutes': downtime_minutes,
            'type': row.get('type', 'corrective'),
            'cause_text': row.get('cause_text', ''),
            'description': row.get('description', ''),
        }
        
        result = supabase.table('work_orders').insert(wo_data).execute()
        work_orders.append(result.data[0])
    
    return work_orders

def insert_part_usages(
    supabase: Client,
    df: pd.DataFrame,
    work_orders: list,
    parts_map: dict
):
    """Insert part usages from DataFrame."""
    # Create work order code -> id mapping
    wo_map = {wo['wo_code']: wo['id'] for wo in work_orders}
    
    # Filter rows with part_sku
    parts_df = df[df['part_sku'].notna()]
    
    usages_inserted = 0
    
    for _, row in parts_df.iterrows():
        wo_code = row['wo_code']
        part_sku = row['part_sku']
        quantity = int(row.get('quantity', 1))
        
        wo_id = wo_map.get(wo_code)
        part_id = parts_map.get(part_sku)
        
        if not wo_id or not part_id:
            print(f"⚠️  Skipping part usage: WO {wo_code} or Part {part_sku} not found")
            continue
        
        # Insert part usage
        usage_data = {
            'work_order_id': wo_id,
            'part_id': part_id,
            'quantity': quantity,
        }
        
        try:
            supabase.table('part_usages').insert(usage_data).execute()
            usages_inserted += 1
            
            # Decrement stock (simple approach)
            supabase.rpc('decrement_stock', {
                'part_uuid': part_id,
                'qty': quantity
            }).execute()
            
        except Exception as e:
            print(f"⚠️  Failed to insert part usage: {e}")
    
    return usages_inserted

def main():
    parser = argparse.ArgumentParser(description='Import maintenance data from Excel to Supabase')
    parser.add_argument('--file', required=True, help='Path to Excel file')
    parser.add_argument('--tenant-id', required=True, help='Tenant UUID')
    
    args = parser.parse_args()
    
    # Validate file exists
    file_path = Path(args.file)
    if not file_path.exists():
        print(f"❌ File not found: {file_path}")
        sys.exit(1)
    
    # Initialize Supabase
    try:
        supabase = init_supabase()
    except ValueError as e:
        print(f"❌ {e}")
        sys.exit(1)
    
    # Read Excel
    print(f"📖 Reading Excel file: {file_path}")
    try:
        df = pd.read_excel(file_path)
    except Exception as e:
        print(f"❌ Failed to read Excel: {e}")
        sys.exit(1)
    
    print(f"✅ Loaded {len(df)} rows")
    
    # Validate required columns
    required_cols = ['asset_code', 'wo_code', 'start_at', 'technician']
    missing_cols = [col for col in required_cols if col not in df.columns]
    if missing_cols:
        print(f"❌ Missing required columns: {missing_cols}")
        sys.exit(1)
    
    # ETL Process
    print("\n🔄 Starting ETL process...")
    
    # 1. Upsert assets
    print("\n1️⃣  Upserting assets...")
    assets_map = upsert_assets(supabase, df, args.tenant_id)
    print(f"✅ {len(assets_map)} assets processed")
    
    # 2. Upsert technicians
    print("\n2️⃣  Upserting technicians...")
    technicians_map = upsert_technicians(supabase, df, args.tenant_id)
    print(f"✅ {len(technicians_map)} technicians processed")
    
    # 3. Upsert spare parts
    print("\n3️⃣  Upserting spare parts...")
    parts_map = upsert_spare_parts(supabase, df, args.tenant_id)
    print(f"✅ {len(parts_map)} spare parts processed")
    
    # 4. Insert work orders
    print("\n4️⃣  Inserting work orders...")
    work_orders = insert_work_orders(supabase, df, args.tenant_id, assets_map, technicians_map)
    print(f"✅ {len(work_orders)} work orders processed")
    
    # 5. Insert part usages
    print("\n5️⃣  Inserting part usages...")
    usages_inserted = insert_part_usages(supabase, df, work_orders, parts_map)
    print(f"✅ {usages_inserted} part usages inserted")
    
    # Summary
    summary = {
        'success': True,
        'message': 'Import completed successfully',
        'data': {
            'assets_created': len(assets_map),
            'technicians_created': len(technicians_map),
            'work_orders_created': len(work_orders),
            'parts_used': usages_inserted,
        }
    }
    
    print("\n" + "="*50)
    print("✅ ETL COMPLETED SUCCESSFULLY")
    print("="*50)
    print(json.dumps(summary, indent=2))
    
    # Output JSON for API consumption
    return summary

if __name__ == '__main__':
    try:
        result = main()
        print(json.dumps(result))
    except Exception as e:
        error_result = {
            'success': False,
            'message': str(e),
        }
        print(json.dumps(error_result))
        sys.exit(1)
