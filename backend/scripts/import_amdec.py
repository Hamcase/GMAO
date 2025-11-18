#!/usr/bin/env python3
"""
Import AMDEC/FMEA data from CSV/Excel files into Supabase.

Expected columns:
- function_name: Function/System name
- failure_mode: Failure mode description
- cause: Failure cause
- effect: Effect/consequence
- severity (S): 1-10
- occurrence (O): 1-10
- detection (D): 1-10
- asset_code (optional): Associated equipment
"""

import sys
import os
import json
import argparse
from typing import Dict, List, Any

# Early dependency checks
try:
    import pandas as pd
except ImportError as e:
    print(json.dumps({
        "success": False,
        "error": f"Missing dependency: {str(e)}. Run: pip install pandas openpyxl"
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


REQUIRED_COLUMNS = ['function_name', 'failure_mode', 'severity', 'occurrence', 'detection']
OPTIONAL_COLUMNS = ['cause', 'effect', 'asset_code', 'current_controls', 'recommended_actions']


def load_file(file_path: str) -> pd.DataFrame:
    """Load CSV or Excel file with proper encoding detection."""
    file_ext = os.path.splitext(file_path)[1].lower()
    
    if file_ext == '.csv':
        # Try multiple encodings for CSV files
        encodings_to_try = ['utf-8', 'cp1252', 'latin-1', 'iso-8859-1']
        separators_to_try = [',', ';', '\t']
        df = None
        last_error = None
        
        for encoding in encodings_to_try:
            for sep in separators_to_try:
                try:
                    df = pd.read_csv(
                        file_path, 
                        encoding=encoding,
                        sep=sep,
                        on_bad_lines='skip',  # Skip malformed lines
                        engine='python'  # Python engine is more flexible
                    )
                    # Validate we got reasonable data
                    if len(df.columns) >= 3 and len(df) > 0:
                        print(f"✅ CSV loaded with encoding={encoding}, separator='{sep}'", file=sys.stderr)
                        break
                except Exception as e:
                    last_error = e
                    continue
            if df is not None and len(df.columns) >= 3:
                break
        
        if df is None or len(df.columns) < 3:
            raise ValueError(f"Failed to decode CSV with encodings {encodings_to_try} and separators {separators_to_try}. Last error: {last_error}")
            
    elif file_ext in ['.xlsx', '.xls']:
        df = pd.read_excel(file_path, engine='openpyxl')
    else:
        raise ValueError(f"Unsupported file format: {file_ext}")
    
    print(f"✅ Loaded {len(df)} rows with {len(df.columns)} columns", file=sys.stderr)
    return df


def validate_columns(df: pd.DataFrame) -> None:
    """Validate required columns are present."""
    df_columns = [col.lower().strip() for col in df.columns]
    missing = [col for col in REQUIRED_COLUMNS if col.lower() not in df_columns]
    
    if missing:
        print(f"📋 Available columns: {list(df.columns)}", file=sys.stderr)
        raise ValueError(f"Missing required columns: {missing}")
    
    print(f"✅ All required columns present", file=sys.stderr)


def normalize_column_names(df: pd.DataFrame) -> pd.DataFrame:
    """Normalize column names to match expected format."""
    column_mapping = {}
    
    for col in df.columns:
        col_lower = col.lower().strip()
        
        # Map common variations
        if col_lower in ['function', 'fonction', 'function_name', 'system']:
            column_mapping[col] = 'function_name'
        elif col_lower in ['failure_mode', 'mode_defaillance', 'failure', 'defaillance']:
            column_mapping[col] = 'failure_mode'
        elif col_lower in ['cause', 'causes']:
            column_mapping[col] = 'cause'
        elif col_lower in ['effect', 'effet', 'effects', 'effets', 'consequence']:
            column_mapping[col] = 'effect'
        elif col_lower in ['severity', 'severite', 's', 'gravite']:
            column_mapping[col] = 'severity'
        elif col_lower in ['occurrence', 'o', 'frequence', 'frequency']:
            column_mapping[col] = 'occurrence'
        elif col_lower in ['detection', 'd', 'detectabilite']:
            column_mapping[col] = 'detection'
        elif col_lower in ['asset_code', 'asset', 'equipment', 'equipement']:
            column_mapping[col] = 'asset_code'
    
    if column_mapping:
        df = df.rename(columns=column_mapping)
        print(f"✅ Normalized column names: {list(column_mapping.values())}", file=sys.stderr)
    
    return df


def looks_like_maintenance(df: pd.DataFrame) -> bool:
    """Heuristics to detect maintenance/WO files misrouted as AMDEC.
    Checks for typical maintenance headers in French.
    """
    cols = [str(c).lower() for c in df.columns]
    markers = [
        'type de panne', 'type',
        'désignation', 'designation',
        'date intervention', 'durée arrêt', 'duree arret',
        'coût total intervention', 'cout total intervention'
    ]
    return any(m in ' '.join(cols) for m in markers)


def upsert_functions(supabase: Client, df: pd.DataFrame, tenant_id: str) -> Dict[str, str]:
    """Create or get functions, return mapping of name -> id."""
    function_names = df['function_name'].dropna().unique()
    function_map = {}
    
    print(f"🔧 Processing {len(function_names)} functions...", file=sys.stderr)
    
    for name in function_names:
        name = str(name).strip()
        if not name:
            continue
        
        try:
            # Check if exists
            result = supabase.table('functions').select('id').eq('tenant_id', tenant_id).eq('name', name).execute()
            
            if result.data:
                function_id = result.data[0]['id']
            else:
                # Create new
                result = supabase.table('functions').insert({
                    'tenant_id': tenant_id,
                    'name': name,
                    'description': f'Imported from AMDEC'
                }).execute()
                function_id = result.data[0]['id']
            
            function_map[name] = function_id
        except Exception as e:
            print(f"⚠️ Error processing function '{name}': {str(e)}", file=sys.stderr)
    
    print(f"✅ {len(function_map)} functions processed", file=sys.stderr)
    return function_map


def insert_failure_modes(supabase: Client, df: pd.DataFrame, function_map: Dict[str, str], tenant_id: str) -> int:
    """Insert failure modes with RPN calculation."""
    inserted = 0
    
    print(f"💾 Inserting failure modes...", file=sys.stderr)
    
    for idx, row in df.iterrows():
        try:
            function_name = str(row['function_name']).strip()
            function_id = function_map.get(function_name)
            
            if not function_id:
                print(f"⚠️ Skipping row {idx}: function not found", file=sys.stderr)
                continue
            
            # Calculate RPN
            severity = int(row['severity'])
            occurrence = int(row['occurrence'])
            detection = int(row['detection'])
            rpn = severity * occurrence * detection
            
            record = {
                'tenant_id': tenant_id,
                'function_id': function_id,
                'failure_mode': str(row['failure_mode']).strip(),
                'cause': str(row.get('cause', '')).strip() if pd.notna(row.get('cause')) else None,
                'effect': str(row.get('effect', '')).strip() if pd.notna(row.get('effect')) else None,
                'severity': severity,
                'occurrence': occurrence,
                'detection': detection,
                'rpn': rpn,
                'current_controls': str(row.get('current_controls', '')).strip() if pd.notna(row.get('current_controls')) else None,
                'recommended_actions': str(row.get('recommended_actions', '')).strip() if pd.notna(row.get('recommended_actions')) else None
            }
            
            supabase.table('failure_modes').insert(record).execute()
            inserted += 1
            
        except Exception as e:
            print(f"⚠️ Error inserting row {idx}: {str(e)}", file=sys.stderr)
    
    print(f"✅ {inserted} failure modes inserted", file=sys.stderr)
    return inserted


def main():
    parser = argparse.ArgumentParser(description='Import AMDEC/FMEA data into Supabase')
    parser.add_argument('--file', required=True, help='Path to CSV/Excel file')
    parser.add_argument('--tenant-id', required=True, help='Tenant UUID')
    args = parser.parse_args()
    
    # Get environment variables
    supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not supabase_url or not supabase_key:
        print(json.dumps({
            "success": False,
            "error": "Missing environment variables"
        }))
        sys.exit(1)
    
    # Check file
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
        print(f"✅ Connected to Supabase", file=sys.stderr)
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": f"Supabase connection failed: {str(e)}"
        }))
        sys.exit(1)
    
    try:
        # Load
        df = load_file(args.file)
        df = normalize_column_names(df)

        # Validate required AMDEC columns
        try:
            validate_columns(df)
        except Exception as ve:
            # Provide a clearer hint if this looks like a maintenance/WO file
            if looks_like_maintenance(df):
                print(json.dumps({
                    "success": False,
                    "error": "This file looks like maintenance/work orders data, not AMDEC/FMEA. Please upload it using the maintenance importer (or remove 'amdec' from the filename so it is auto-detected as maintenance).",
                    "available_columns": list(df.columns)
                }), file=sys.stderr)
                sys.exit(1)
            else:
                raise ve
        
        # Process data
        function_map = upsert_functions(supabase, df, args.tenant_id)
        inserted = insert_failure_modes(supabase, df, function_map, args.tenant_id)
        
        # Success
        print(json.dumps({
            "success": True,
            "message": "AMDEC import completed successfully",
            "data": {
                "failure_modes_inserted": inserted,
                "functions_processed": len(function_map)
            }
        }))
        sys.exit(0)
        
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
