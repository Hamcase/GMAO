#!/usr/bin/env python3
"""
Import KPI metrics (MTBF, MTTR, Availability) from Excel/CSV files into Supabase.

Expected format: Equipment rows with monthly availability/reliability metrics.
This script handles complex Excel layouts with merged cells and multiple header rows.
"""

import sys
import os
import json
import argparse
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import re

# Early dependency checks
try:
    import pandas as pd
    import numpy as np
except ImportError as e:
    print(json.dumps({
        "success": False,
        "error": f"Missing dependency: {str(e)}. Run: pip install pandas openpyxl numpy"
    }))
    sys.exit(1)

try:
    from supabase import create_client, Client
except ImportError:
    print(json.dumps({
        "success": False,
        "error": "Missing supabase dependency. Run: pip install supabase"
    }))
    sys.exit(1)


def parse_excel_kpis(file_path: str) -> pd.DataFrame:
    """
    Parse KPI Excel file with flexible structure detection.
    Handles merged cells, multiple header rows, and various layouts.
    """
    print(f"📊 Analyzing Excel structure: {file_path}", file=sys.stderr)
    
    # Read raw data to detect structure
    df_raw = pd.read_excel(file_path, header=None, engine='openpyxl')
    print(f"✅ Loaded {len(df_raw)} rows, {len(df_raw.columns)} columns", file=sys.stderr)
    
    # Find the header row (contains date/month columns)
    header_row = None
    for idx, row in df_raw.iterrows():
        row_str = ' '.join([str(x) for x in row.values if pd.notna(x)])
        # Look for month names or date patterns
        if any(month in row_str.lower() for month in ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 
                                                        'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
                                                        'january', 'february', 'march', 'april', 'may', 'june',
                                                        'july', 'august', 'september', 'october', 'november', 'december']):
            header_row = idx
            print(f"📍 Found header row at index {idx}", file=sys.stderr)
            break
    
    if header_row is None:
        # Fallback: assume first row with many non-empty cells is header
        for idx, row in df_raw.iterrows():
            non_empty = row.notna().sum()
            if non_empty > 3:
                header_row = idx
                print(f"📍 Assuming header row at index {idx} (fallback)", file=sys.stderr)
                break
    
    if header_row is None:
        raise ValueError("Could not detect header row in Excel file")
    
    # Re-read with detected header
    df = pd.read_excel(file_path, header=header_row, engine='openpyxl')
    
    # Clean column names
    df.columns = [str(col).strip() for col in df.columns]
    print(f"📋 Columns: {list(df.columns)[:10]}...", file=sys.stderr)
    
    return df


def normalize_kpi_data(df: pd.DataFrame, tenant_id: str) -> List[Dict[str, Any]]:
    """
    Normalize KPI DataFrame into records for asset_kpis table.
    
    Expects structure:
    - First column(s): Equipment/Asset identifiers
    - Following columns: Monthly metrics (MTBF, MTTR, Availability, etc.)
    """
    print("🔄 Normalizing KPI data...", file=sys.stderr)
    
    records = []
    
    # Detect equipment column (first non-unnamed column with asset-like values)
    equipment_col = None
    for col in df.columns:
        if 'unnamed' not in col.lower() and df[col].notna().sum() > 0:
            # Check if values look like asset codes
            sample = df[col].dropna().astype(str).iloc[0] if len(df[col].dropna()) > 0 else ""
            if len(sample) > 0:
                equipment_col = col
                print(f"✅ Detected equipment column: {equipment_col}", file=sys.stderr)
                break
    
    if equipment_col is None:
        # Use first column as fallback
        equipment_col = df.columns[0]
        print(f"⚠️ Using first column as equipment: {equipment_col}", file=sys.stderr)
    
    # Process each row (equipment)
    for idx, row in df.iterrows():
        asset_code = str(row[equipment_col]).strip()
        
        # Skip empty or header-like rows
        if pd.isna(row[equipment_col]) or asset_code.lower() in ['nan', 'unnamed', 'equipment', 'asset']:
            continue
        
        # Look for metric columns (availability, mtbf, mttr)
        for col in df.columns:
            if col == equipment_col or 'unnamed' in col.lower():
                continue
            
            value = row[col]
            if pd.isna(value):
                continue
            
            # Try to parse as numeric
            try:
                metric_value = float(value)
            except (ValueError, TypeError):
                continue
            
            # Detect metric type from column name
            col_lower = col.lower()
            if 'dispo' in col_lower or 'availability' in col_lower or 'avail' in col_lower:
                metric_type = 'availability'
                # Convert to percentage if needed (0-1 range to 0-100)
                if metric_value <= 1.0:
                    metric_value = metric_value * 100
            elif 'mtbf' in col_lower:
                metric_type = 'mtbf'
            elif 'mttr' in col_lower:
                metric_type = 'mttr'
            else:
                # Default to availability for numeric columns
                metric_type = 'availability'
                if metric_value <= 1.0:
                    metric_value = metric_value * 100
            
            # Create record
            record = {
                'tenant_id': tenant_id,
                'asset_code': asset_code,
                'metric_type': metric_type,
                'metric_value': round(metric_value, 2),
                'recorded_at': datetime.now().isoformat(),
                'period': col  # Store original column name as period
            }
            records.append(record)
    
    print(f"✅ Normalized {len(records)} KPI records from {len(df)} equipment rows", file=sys.stderr)
    return records


def upsert_kpis(supabase: Client, records: List[Dict[str, Any]]) -> int:
    """Insert KPI records into asset_kpis table."""
    if not records:
        return 0
    
    print(f"💾 Inserting {len(records)} KPI records...", file=sys.stderr)
    
    # Batch insert (Supabase handles conflicts based on unique constraints)
    try:
        result = supabase.table('asset_kpis').upsert(records).execute()
        inserted = len(result.data) if result.data else len(records)
        print(f"✅ Inserted {inserted} KPI records", file=sys.stderr)
        return inserted
    except Exception as e:
        print(f"⚠️ Error inserting KPIs: {str(e)}", file=sys.stderr)
        # Try individual inserts as fallback
        inserted = 0
        for record in records:
            try:
                supabase.table('asset_kpis').insert(record).execute()
                inserted += 1
            except Exception as e2:
                print(f"⚠️ Failed to insert record for {record.get('asset_code')}: {str(e2)}", file=sys.stderr)
        return inserted


def main():
    parser = argparse.ArgumentParser(description='Import KPI metrics into Supabase')
    parser.add_argument('--file', required=True, help='Path to Excel/CSV file')
    parser.add_argument('--tenant-id', required=True, help='Tenant UUID')
    args = parser.parse_args()
    
    # Get environment variables
    supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not supabase_url or not supabase_key:
        print(json.dumps({
            "success": False,
            "error": "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
        }))
        sys.exit(1)
    
    # Check file exists
    if not os.path.exists(args.file):
        print(json.dumps({
            "success": False,
            "error": f"File not found: {args.file}"
        }))
        sys.exit(1)
    
    print(f"✅ File exists: {args.file}", file=sys.stderr)
    
    # Connect to Supabase
    try:
        supabase = create_client(supabase_url, supabase_key)
        print(f"✅ Connected to Supabase: {supabase_url[:30]}...", file=sys.stderr)
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Failed to connect to Supabase: {str(e)}"
        }))
        sys.exit(1)
    
    try:
        # Parse file
        file_ext = os.path.splitext(args.file)[1].lower()
        
        if file_ext in ['.xlsx', '.xls']:
            df = parse_excel_kpis(args.file)
        elif file_ext == '.csv':
            df = pd.read_csv(args.file)
            print(f"✅ Loaded {len(df)} rows from CSV", file=sys.stderr)
        else:
            raise ValueError(f"Unsupported file format: {file_ext}")
        
        # Normalize data
        records = normalize_kpi_data(df, args.tenant_id)
        
        if not records:
            print(json.dumps({
                "success": False,
                "error": "No valid KPI data found in file"
            }))
            sys.exit(1)
        
        # Insert records
        inserted = upsert_kpis(supabase, records)
        
        # Success response
        print(json.dumps({
            "success": True,
            "message": "KPI import completed successfully",
            "data": {
                "kpis_inserted": inserted,
                "rows_processed": len(df)
            }
        }))
        sys.exit(0)
        
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Import failed: {str(e)}"
        }), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
