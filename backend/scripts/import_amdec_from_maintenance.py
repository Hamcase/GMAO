#!/usr/bin/env python3
"""
Import AMDEC data from maintenance-style CSVs
Maps maintenance columns to AMDEC/FMEA structure:
- 'Organe' → function_name (component/system)
- 'Type de panne' → failure_mode (type of failure)
- 'cause' → cause (failure cause)
- Assigns default severity/occurrence/detection scores based on downtime

Usage:
    python import_amdec_from_maintenance.py --file AMDEC.csv --tenant-id <uuid>
"""

import sys
import os
import json
import argparse
from typing import Dict

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

def load_file(file_path: str) -> pd.DataFrame:
    """Load CSV or Excel file with proper encoding detection."""
    file_ext = os.path.splitext(file_path)[1].lower()
    
    if file_ext == '.csv':
        encodings_to_try = ['utf-8', 'cp1252', 'latin-1', 'iso-8859-1']
        separators_to_try = [',', ';', '\t']
        df = None
        
        for encoding in encodings_to_try:
            for sep in separators_to_try:
                try:
                    df = pd.read_csv(
                        file_path, 
                        encoding=encoding,
                        sep=sep,
                        on_bad_lines='skip',
                        engine='python'
                    )
                    if len(df.columns) >= 3 and len(df) > 0:
                        print(f"✅ CSV loaded with encoding={encoding}, separator='{sep}'", file=sys.stderr)
                        break
                except Exception:
                    continue
            if df is not None and len(df.columns) >= 3:
                break
        
        if df is None or len(df.columns) < 3:
            raise ValueError(f"Failed to parse CSV")
            
    elif file_ext in ['.xlsx', '.xls']:
        df = pd.read_excel(file_path, engine='openpyxl')
    else:
        raise ValueError(f"Unsupported file format: {file_ext}")
    
    print(f"✅ Loaded {len(df)} rows with {len(df.columns)} columns", file=sys.stderr)
    return df

def clean_numeric_value(value) -> float:
    """Convert string numeric values with comma decimal separator to float."""
    if pd.isna(value):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    # Replace comma with dot for French/European decimal format
    return float(str(value).replace(',', '.'))

def map_maintenance_to_amdec(df: pd.DataFrame) -> pd.DataFrame:
    """Map maintenance-style columns to AMDEC structure."""
    
    # Normalize column names
    df.columns = [str(col).strip() for col in df.columns]
    
    # Create mapping
    amdec_df = pd.DataFrame()
    
    # Function name: Organe (component/system) or Désignation (asset)
    if 'Organe' in df.columns:
        amdec_df['function_name'] = df['Organe']
    elif 'Désignation' in df.columns:
        amdec_df['function_name'] = df['Désignation']
    else:
        amdec_df['function_name'] = 'Unknown System'
    
    # Failure mode: Type de panne (failure type)
    if 'Type de panne' in df.columns:
        amdec_df['failure_mode'] = df['Type de panne']
    else:
        amdec_df['failure_mode'] = 'General Failure'
    
    # Cause: cause or Résumé intervention
    if 'cause' in df.columns:
        amdec_df['cause'] = df['cause']
    elif 'Résumé intervention' in df.columns:
        amdec_df['cause'] = df['Résumé intervention']
    else:
        amdec_df['cause'] = None
    
    # Effect: Use description or leave empty
    amdec_df['effect'] = 'Equipment downtime'
    
    # Asset code if available
    if 'Désignation' in df.columns:
        amdec_df['asset_code'] = df['Désignation']
    
    # Calculate severity/occurrence/detection from downtime if available
    if 'Durée arrêt (h)' in df.columns:
        # Severity: based on downtime duration (1-10 scale)
        # 0-1h=2, 1-4h=4, 4-8h=6, 8-24h=8, >24h=10
        def calc_severity(hours):
            try:
                h = clean_numeric_value(hours)
                if h is None: return 5
                if h <= 1: return 2
                elif h <= 4: return 4
                elif h <= 8: return 6
                elif h <= 24: return 8
                else: return 10
            except:
                return 5
        
        amdec_df['severity'] = df['Durée arrêt (h)'].apply(calc_severity)
    else:
        amdec_df['severity'] = 5  # Default medium severity
    
    # Occurrence: Count frequency per failure mode (simplified)
    failure_counts = df.groupby('Type de panne').size() if 'Type de panne' in df.columns else {}
    
    def calc_occurrence(failure_type):
        if pd.isna(failure_type): return 5
        count = failure_counts.get(failure_type, 1)
        # Map count to 1-10 scale: 1-2=2, 3-5=4, 6-10=6, 11-20=8, >20=10
        if count <= 2: return 2
        elif count <= 5: return 4
        elif count <= 10: return 6
        elif count <= 20: return 8
        else: return 10
    
    amdec_df['occurrence'] = amdec_df['failure_mode'].apply(calc_occurrence)
    
    # Detection: Default to medium (5) - could be enhanced with more data
    amdec_df['detection'] = 5
    
    print(f"📊 Mapped {len(amdec_df)} rows to AMDEC format", file=sys.stderr)
    return amdec_df

def upsert_functions(supabase: Client, df: pd.DataFrame, tenant_id: str) -> Dict[str, str]:
    """Create or get functions."""
    function_names = df['function_name'].dropna().unique()
    function_map = {}
    
    print(f"🔧 Processing {len(function_names)} functions...", file=sys.stderr)
    
    for name in function_names:
        name = str(name).strip()
        if not name:
            continue
        
        try:
            result = supabase.table('functions').select('id').eq('tenant_id', tenant_id).eq('name', name).execute()
            
            if result.data:
                function_id = result.data[0]['id']
            else:
                result = supabase.table('functions').insert({
                    'tenant_id': tenant_id,
                    'name': name,
                    'description': 'Imported from maintenance AMDEC'
                }).execute()
                function_id = result.data[0]['id']
            
            function_map[name] = function_id
        except Exception as e:
            print(f"⚠️ Error processing function '{name}': {e}", file=sys.stderr)
    
    print(f"✅ {len(function_map)} functions processed", file=sys.stderr)
    return function_map

def insert_failure_modes(supabase: Client, df: pd.DataFrame, function_map: Dict[str, str], tenant_id: str) -> int:
    """Insert failure modes with calculated RPN."""
    inserted = 0
    
    print(f"💾 Inserting failure modes...", file=sys.stderr)
    
    for idx, row in df.iterrows():
        try:
            function_name = str(row['function_name']).strip()
            function_id = function_map.get(function_name)
            
            if not function_id:
                continue
            
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
            }
            
            supabase.table('failure_modes').insert(record).execute()
            inserted += 1
            
            if inserted % 100 == 0:
                print(f"   📈 {inserted} records inserted...", file=sys.stderr)
            
        except Exception as e:
            print(f"⚠️ Error inserting row {idx}: {e}", file=sys.stderr)
    
    print(f"✅ {inserted} failure modes inserted", file=sys.stderr)
    return inserted

def main():
    parser = argparse.ArgumentParser(description='Import AMDEC from maintenance CSV')
    parser.add_argument('--file', required=True, help='Path to CSV file')
    parser.add_argument('--tenant-id', required=True, help='Tenant UUID')
    args = parser.parse_args()
    
    supabase_url = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
    supabase_key = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    
    if not supabase_url or not supabase_key:
        print(json.dumps({"success": False, "error": "Missing environment variables"}))
        sys.exit(1)
    
    if not os.path.exists(args.file):
        print(json.dumps({"success": False, "error": f"File not found: {args.file}"}))
        sys.exit(1)
    
    print(f"✅ File exists: {args.file}", file=sys.stderr)
    
    try:
        supabase = create_client(supabase_url, supabase_key)
        print(f"✅ Connected to Supabase", file=sys.stderr)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Supabase connection failed: {e}"}))
        sys.exit(1)
    
    try:
        df = load_file(args.file)
        amdec_df = map_maintenance_to_amdec(df)
        
        function_map = upsert_functions(supabase, amdec_df, args.tenant_id)
        inserted = insert_failure_modes(supabase, amdec_df, function_map, args.tenant_id)
        
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
        print(json.dumps({"success": False, "error": str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
