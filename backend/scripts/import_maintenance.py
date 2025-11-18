#!/usr/bin/env python3
"""
GMAO Maintenance Data ETL Script - INTELLIGENT COLUMN DETECTION
Imports Excel/CSV maintenance data into Supabase database.

AUTO-DETECTS column names - no specific format required!
Works with: Workload.csv, GMAO_Integrator.csv, and any similar format.

Detects columns like:
- Equipment: "Désignation", "machine", "asset", "equipment"
- Date: "Date intervention", "start_at", "date"
- Technician: "[MO interne].Nom", "technician", "tech"
- Duration: "Durée arrêt (h)", "duration", "hours"
- Cost: "Coût total intervention", "cost", "price"
- Parts: "[Pièce].Référence", "part_sku", "reference"

Usage:
    python import_maintenance.py --file data.csv --tenant-id <uuid>
"""

import argparse
import sys
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
import re

# Check dependencies early
try:
    import pandas as pd
except ImportError:
    print(json.dumps({
        'success': False,
        'message': 'pandas not installed. Run: pip install pandas openpyxl'
    }))
    sys.exit(1)

try:
    from supabase import create_client, Client
except ImportError:
    print(json.dumps({
        'success': False,
        'message': 'supabase not installed. Run: pip install supabase'
    }))
    sys.exit(1)

import os

# --- JSON sanitizer ---
def sanitize_json_value(value):
    import numpy as np
    import pandas as pd
    if pd.isna(value) or value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        if isinstance(value, float) and (np.isnan(value) or np.isinf(value)):
            return None
        return value
    if isinstance(value, (pd.Timestamp, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(k): sanitize_json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [sanitize_json_value(v) for v in value]
    # Fallback: convert to string
    return str(value)

# Import column mapper
try:
    from column_mapper import ColumnMapper
except ImportError:
    print(json.dumps({
        'success': False,
        'message': 'column_mapper.py not found. Ensure it\'s in the same directory.'
    }), file=sys.stderr)
    sys.exit(1)

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
    """Parse datetime from various formats including French dates."""
    if pd.isna(value):
        return None
    
    if isinstance(value, datetime):
        # Ensure timezone-aware
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    
    value_str = str(value).strip()
    
    # Try ISO 8601 format
    try:
        dt = datetime.fromisoformat(value_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except ValueError:
        pass
    
    # Try common formats (including French DD/MM/YYYY)
    for fmt in [
        '%Y-%m-%d %H:%M:%S',
        '%Y-%m-%d',
        '%d/%m/%Y %H:%M:%S',
        '%d/%m/%Y %H:%M',
        '%d/%m/%Y',
        '%m/%d/%Y',
        '%Y/%m/%d'
    ]:
        try:
            dt = datetime.strptime(value_str, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    
    raise ValueError(f"Unable to parse datetime: {value}")


def parse_float(value) -> float:
    """Parse float from various formats (handles French decimal separator)."""
    if pd.isna(value):
        return None
    
    if isinstance(value, (int, float)):
        return float(value)
    
    # Handle French decimal separator (comma instead of dot)
    value_str = str(value).strip().replace(',', '.')
    
    try:
        return float(value_str)
    except ValueError:
        return None


def generate_wo_code(asset_code: str, date: datetime, suffix: int = 0) -> str:
    """Generate a work order code if not provided."""
    date_str = date.strftime('%Y%m%d') if date else datetime.now().strftime('%Y%m%d')
    asset_short = re.sub(r'[^a-zA-Z0-9]', '', asset_code[:6].upper())
    return f"WO-{asset_short}-{date_str}-{suffix:03d}"

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
    
    # Check if part_sku column exists
    if 'part_sku' not in df.columns:
        return parts_map
    
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
    """Insert work orders from DataFrame with batching to avoid timeouts."""
    work_orders = []
    batch_size = 250

    # Pre-fetch existing wo_codes for this tenant to skip duplicates efficiently
    # Chunk query using in_ operator (if available); fallback to per-row check if error occurs.
    all_codes = df['wo_code'].dropna().unique().tolist()
    existing_codes = set()
    try:
        for i in range(0, len(all_codes), 500):
            chunk = all_codes[i:i+500]
            try:
                res = supabase.table('work_orders') \
                    .select('wo_code') \
                    .eq('tenant_id', tenant_id) \
                    .in_('wo_code', chunk) \
                    .execute()
                if res.data:
                    for r in res.data:
                        existing_codes.add(r['wo_code'])
            except Exception:
                # Fallback: break out to per-row existence checks later
                existing_codes = None
                break
    except Exception:
        existing_codes = None

    rows_to_insert = []
    duplicate_logged = 0

    for _, row in df.iterrows():
        wo_code = row['wo_code']
        if pd.isna(wo_code):
            continue

        # Duplicate skip
        if existing_codes is not None and wo_code in existing_codes:
            if duplicate_logged < 20:
                print(f"ℹ️  WO {wo_code} already exists, skipping", file=sys.stderr)
                duplicate_logged += 1
            continue

        # Fallback per-row duplicate check if bulk retrieval failed
        if existing_codes is None:
            try:
                exists_res = supabase.table('work_orders') \
                    .select('id') \
                    .eq('tenant_id', tenant_id) \
                    .eq('wo_code', wo_code) \
                    .execute()
                if exists_res.data:
                    if duplicate_logged < 20:
                        print(f"ℹ️  WO {wo_code} already exists, skipping", file=sys.stderr)
                        duplicate_logged += 1
                    continue
            except Exception as e:
                print(f"⚠️  Existence check failed for {wo_code}: {e}", file=sys.stderr)

        # Asset / technician IDs
        asset_id = assets_map.get(row.get('asset_code'))
        technician_id = technicians_map.get(row.get('technician'))
        if not asset_id:
            continue

        # Parse times
        try:
            start_at = parse_datetime(row.get('start_at'))
            end_at = parse_datetime(row.get('end_at')) if pd.notna(row.get('end_at')) else None
        except Exception:
            continue
        downtime_minutes = int((end_at - start_at).total_seconds() / 60) if start_at and end_at else None

        standard_columns = {
            'tenant_id', 'wo_code', 'asset_code', 'asset_id', 'technician', 'technician_id',
            'start_at', 'end_at', 'downtime_minutes', 'type', 'wo_type', 'cause', 'cause_text',
            'description', 'duration_hours', 'cost_total', 'cost_material', 'cost_labor',
            'part_reference', 'part_designation', 'part_quantity', 'part_sku',
            'technician_firstname', 'technician_lastname', 'technician_hours'
        }
        custom_columns = {}
        for col in row.index:
            if col not in standard_columns:
                val = row[col]
                sanitized = sanitize_json_value(val)
                if sanitized is not None:
                    custom_columns[col] = sanitized

        cause_text_safe = sanitize_json_value(row.get('cause', row.get('cause_text')))
        description_safe = sanitize_json_value(row.get('description', row.get('cause')))

        wo_data = {
            'tenant_id': tenant_id,
            'wo_code': wo_code,
            'asset_id': asset_id,
            'technician_id': technician_id,
            'start_at': start_at.isoformat() if start_at else None,
            'end_at': end_at.isoformat() if end_at else None,
            'downtime_minutes': downtime_minutes,
            'type': row.get('wo_type', 'corrective'),
            'cause_text': cause_text_safe,
            'description': description_safe,
            'custom_columns': custom_columns
        }
        rows_to_insert.append(wo_data)

        # Batch flush
        if len(rows_to_insert) >= batch_size:
            try:
                res = supabase.table('work_orders').insert(rows_to_insert).execute()
                if res.data:
                    work_orders.extend(res.data)
                print(f"✅ Inserted batch of {len(rows_to_insert)} work orders", file=sys.stderr)
            except Exception as e:
                print(f"⚠️  Batch insert failed ({len(rows_to_insert)} items): {e}", file=sys.stderr)
            rows_to_insert = []

    # Final flush
    if rows_to_insert:
        try:
            res = supabase.table('work_orders').insert(rows_to_insert).execute()
            if res.data:
                work_orders.extend(res.data)
            print(f"✅ Inserted final batch of {len(rows_to_insert)} work orders", file=sys.stderr)
        except Exception as e:
            print(f"⚠️  Final batch insert failed ({len(rows_to_insert)} items): {e}", file=sys.stderr)

    return work_orders

def insert_part_usages(
    supabase: Client,
    df: pd.DataFrame,
    work_orders: list,
    parts_map: dict
):
    """Insert part usages from DataFrame."""
    # Check if part_sku column exists
    if 'part_sku' not in df.columns or not parts_map:
        return 0
    
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
            print(f"⚠️  Skipping part usage: WO {wo_code} or Part {part_sku} not found", file=sys.stderr)
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
            print(f"⚠️  Failed to insert part usage: {e}", file=sys.stderr)
    
    return usages_inserted

def main():
    parser = argparse.ArgumentParser(description='Import maintenance data from Excel to Supabase')
    parser.add_argument('--file', required=True, help='Path to Excel file')
    parser.add_argument('--tenant-id', required=True, help='Tenant UUID')
    
    args = parser.parse_args()
    
    # Validate file exists
    file_path = Path(args.file)
    if not file_path.exists():
        error_msg = f"File not found: {file_path}"
        print(f"❌ {error_msg}", file=sys.stderr)
        print(json.dumps({'success': False, 'message': error_msg}))
        sys.exit(1)
    
    print(f"✅ File exists: {file_path}", file=sys.stderr)
    
    # Initialize Supabase
    try:
        supabase = init_supabase()
        print(f"✅ Connected to Supabase: {SUPABASE_URL[:30]}...", file=sys.stderr)
    except ValueError as e:
        error_msg = str(e)
        print(f"❌ {error_msg}", file=sys.stderr)
        print(json.dumps({'success': False, 'message': error_msg}))
        sys.exit(1)
    except Exception as e:
        error_msg = f"Failed to connect to Supabase: {str(e)}"
        print(f"❌ {error_msg}", file=sys.stderr)
        print(json.dumps({'success': False, 'message': error_msg}))
        sys.exit(1)
    
    # Read file (Excel or CSV)
    print(f"📖 Reading file: {file_path}", file=sys.stderr)
    df = None
    try:
        file_ext = file_path.suffix.lower()
        
        if file_ext == '.csv':
            # Try different encodings and separators for CSV
            csv_loaded = False
            for encoding in ['utf-8-sig', 'utf-8', 'cp1252', 'latin-1', 'iso-8859-1']:
                for sep in [';', ',', '\t']:
                    try:
                        df = pd.read_csv(file_path, encoding=encoding, sep=sep)
                        if len(df.columns) > 1:  # Valid parse
                            print(f"✅ CSV loaded with encoding={encoding}, separator='{sep}'", file=sys.stderr)
                            csv_loaded = True
                            break
                    except Exception as e:
                        continue
                if csv_loaded:
                    break
            
            if not csv_loaded or df is None:
                raise ValueError(f"Could not parse CSV file with any encoding/separator combination")
        else:
            df = pd.read_excel(file_path, engine='openpyxl')
        
        if df is None:
            raise ValueError("Failed to load data frame")
        
        print(f"✅ Loaded {len(df)} rows", file=sys.stderr)
        print(f"📊 Columns found: {list(df.columns)}", file=sys.stderr)
    except Exception as e:
        error_msg = f"Failed to read file: {str(e)}"
        print(f"❌ {error_msg}", file=sys.stderr)
        print(json.dumps({'success': False, 'message': error_msg}))
        sys.exit(1)
    
    # INTELLIGENT COLUMN MAPPING
    print("\n🔍 Auto-detecting column mappings...", file=sys.stderr)
    mapper = ColumnMapper(df.columns.tolist())
    mapper.print_mapping()
    
    # Check for minimum required fields (at least asset and date)
    if not mapper.has('asset_code') or not mapper.has('start_at'):
        error_msg = f"Could not detect required columns (equipment/asset and date). Found: {list(df.columns)}"
        print(f"❌ {error_msg}", file=sys.stderr)
        print(json.dumps({'success': False, 'message': error_msg}))
        sys.exit(1)
    
    print(f"✅ Column mapping successful", file=sys.stderr)
    
    # Rename columns to standard names
    column_rename = {v: k for k, v in mapper.get_all().items() if v}
    print(f"🔄 Renaming columns: {column_rename}", file=sys.stderr)
    df = df.rename(columns=column_rename)
    print(f"✅ Columns after rename: {list(df.columns)}", file=sys.stderr)
    
    # Generate work order codes if not present
    if 'wo_code' not in df.columns or df['wo_code'].isna().all():
        print("⚠️  Generating work order codes...", file=sys.stderr)
        df['wo_code'] = df.apply(
            lambda row: generate_wo_code(
                row.get('asset_code', 'UNKNOWN'),
                parse_datetime(row.get('start_at')) if pd.notna(row.get('start_at')) else datetime.now(),
                row.name
            ),
            axis=1
        )
    
    # Combine technician name if split into first/last
    if 'technician_lastname' in df.columns and 'technician_firstname' in df.columns:
        print("✅ Combining technician names...", file=sys.stderr)
        df['technician'] = df.apply(
            lambda row: f"{row.get('technician_firstname', '')} {row.get('technician_lastname', '')}".strip(),
            axis=1
        )
    elif 'technician_lastname' in df.columns:
        df['technician'] = df['technician_lastname']
    elif 'technician_firstname' in df.columns:
        df['technician'] = df['technician_firstname']
    
    # Ensure technician column exists (fallback to "Unknown")
    if 'technician' not in df.columns:
        print("⚠️  No technician detected, using 'Technicien Inconnu'", file=sys.stderr)
        df['technician'] = 'Technicien Inconnu'
    
    # Calculate end_at from duration if available
    if 'duration_hours' in df.columns and 'end_at' not in df.columns:
        print("✅ Calculating end dates from duration...", file=sys.stderr)
        df['end_at'] = df.apply(
            lambda row: (
                parse_datetime(row['start_at']) + timedelta(hours=parse_float(row['duration_hours']) or 0)
                if pd.notna(row.get('start_at')) and pd.notna(row.get('duration_hours'))
                else None
            ),
            axis=1
        )
    
    # Map type/cause to standard work order types
    if 'type' in df.columns:
        type_mapping = {
            'hydraulique': 'corrective',
            'mécanique': 'corrective',
            'mecanique': 'corrective',
            'automate': 'corrective',
            'électrique': 'corrective',
            'electrique': 'corrective',
            'arrosage': 'preventive',
            'préventif': 'preventive',
            'preventif': 'preventive',
            'correctif': 'corrective',
            'corrective': 'corrective',
            'urgence': 'emergency',
            'emergency': 'emergency',
            'amélioration': 'improvement',
            'amelioration': 'improvement',
            'improvement': 'improvement'
        }
        df['wo_type'] = df['type'].apply(
            lambda x: type_mapping.get(str(x).lower().strip(), 'corrective') if pd.notna(x) else 'corrective'
        )
    else:
        df['wo_type'] = 'corrective'  # Default type
    
    # Use 'cause' as description if description not present
    if 'description' not in df.columns and 'cause' in df.columns:
        df['description'] = df['cause']
    
    print(f"✅ Data normalization complete", file=sys.stderr)
    
    # ETL Process
    print("\n🔄 Starting ETL process...", file=sys.stderr)
    
    # 1. Upsert assets
    print("\n1️⃣  Upserting assets...", file=sys.stderr)
    assets_map = upsert_assets(supabase, df, args.tenant_id)
    print(f"✅ {len(assets_map)} assets processed", file=sys.stderr)
    
    # 2. Upsert technicians
    print("\n2️⃣  Upserting technicians...", file=sys.stderr)
    technicians_map = upsert_technicians(supabase, df, args.tenant_id)
    print(f"✅ {len(technicians_map)} technicians processed", file=sys.stderr)
    
    # 3. Upsert spare parts
    print("\n3️⃣  Upserting spare parts...", file=sys.stderr)
    parts_map = upsert_spare_parts(supabase, df, args.tenant_id)
    print(f"✅ {len(parts_map)} spare parts processed", file=sys.stderr)
    
    # 4. Insert work orders
    print("\n4️⃣  Inserting work orders...", file=sys.stderr)
    work_orders = insert_work_orders(supabase, df, args.tenant_id, assets_map, technicians_map)
    print(f"✅ {len(work_orders)} work orders processed", file=sys.stderr)
    
    # 5. Insert part usages
    print("\n5️⃣  Inserting part usages...", file=sys.stderr)
    usages_inserted = insert_part_usages(supabase, df, work_orders, parts_map)
    print(f"✅ {usages_inserted} part usages inserted", file=sys.stderr)
    
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
    
    print("\n" + "="*50, file=sys.stderr)
    print("✅ ETL COMPLETED SUCCESSFULLY", file=sys.stderr)
    print("="*50, file=sys.stderr)
    print(json.dumps(summary, indent=2), file=sys.stderr)
    
    # Output JSON for API consumption (to stdout only)
    return summary

if __name__ == '__main__':
    try:
        result = main()
        # Output only JSON to stdout for parsing
        print(json.dumps(result))
    except Exception as e:
        error_result = {
            'success': False,
            'message': str(e),
        }
        print(f"❌ Fatal error: {e}", file=sys.stderr)
        print(json.dumps(error_result))
        sys.exit(1)
