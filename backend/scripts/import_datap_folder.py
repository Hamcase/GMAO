#!/usr/bin/env python3
"""
Import real maintenance data from a local folder (Data_P) into Supabase.

Supported files in the folder:
- AMDEC.csv
- GMAO_Integrator.csv
- Workload.csv
- Dispo_MTBF_MTTR.xlsx (optional; currently not required)

This script parses French headers and maps them to the normalized schema:
- assets
- technicians
- spare_parts
- work_orders
- part_usages
- failure_modes (basic from cause/category)

Usage:
  python backend/scripts/import_datap_folder.py --path "C:\\Users\\foot-\\Downloads\\Data_P\\Data_P"

Requires env vars:
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

"""
import argparse
import os
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
import pandas as pd

# Allow importing sibling script functions
CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.append(str(CURRENT_DIR))

try:
    from import_maintenance import (
        init_supabase,
        upsert_assets,
        upsert_technicians,
        upsert_spare_parts,
        insert_work_orders,
        insert_part_usages,
        parse_datetime,
    )
except Exception as e:
    print("⚠️ Could not import helper functions from import_maintenance.py:", e)
    init_supabase = None

from supabase import create_client

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')

MONTHS_FR = {
    1: 'Jan', 2: 'Fév', 3: 'Mar', 4: 'Avr', 5: 'Mai', 6: 'Jui',
    7: 'Juil', 8: 'Aoû', 9: 'Sep', 10: 'Oct', 11: 'Nov', 12: 'Déc'
}

def get_client():
    if init_supabase:
        return init_supabase()
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("Missing Supabase credentials: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def read_csv_auto(path: Path) -> pd.DataFrame:
    """Read CSV trying ; then , as separator, handling French decimals."""
    for sep in [';', ',']:
        try:
            df = pd.read_csv(path, sep=sep, engine='python')
            return df
        except Exception:
            continue
    # Fallback
    return pd.read_csv(path)


def to_float_hours(val):
    if pd.isna(val):
        return None
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace('h', '').replace('H', '')
    # French decimal comma
    s = s.replace(',', '.')
    try:
        return float(s)
    except Exception:
        return None


def to_iso_datetime(val):
    if pd.isna(val):
        return None
    if isinstance(val, datetime):
        dt = val
    else:
        # Try multiple formats
        for fmt in [
            '%d/%m/%Y %H:%M', '%d/%m/%Y', '%Y-%m-%d %H:%M', '%Y-%m-%d',
        ]:
            try:
                dt = datetime.strptime(str(val), fmt)
                break
            except Exception:
                dt = None
        if dt is None:
            # Last resort: pandas parser
            try:
                dt = pd.to_datetime(val).to_pydatetime()
            except Exception:
                return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def map_type_fr(s: str) -> str:
    if not s:
        return 'corrective'
    t = str(s).strip().lower()
    if 'prévent' in t or 'prevent' in t:
        return 'preventive'
    if 'urgence' in t or 'urgent' in t:
        return 'emergency'
    if 'amélior' in t or 'amelior' in t:
        return 'improvement'
    return 'corrective'


def build_wo_row(src: str, idx: int, row: pd.Series) -> dict:
    # Common headers across CSVs
    machine = row.get('Désignation') or row.get('Designation') or row.get('Machine')
    type_panne = row.get('Type de panne')
    cause = row.get('Cause') or row.get('Résultat') or row.get('Resultat')
    date_intervention = row.get('Date intervention') or row.get('Date Intervention')
    duration_h = row.get('Durée arrêt (h)') or row.get('Duree arret (h)')

    start_iso = to_iso_datetime(date_intervention)
    hours = to_float_hours(duration_h) or 0
    end_iso = None
    if start_iso:
        try:
            start_dt = datetime.fromisoformat(start_iso)
        except Exception:
            start_dt = None
        if start_dt:
            end_iso = (start_dt + timedelta(hours=hours)).isoformat()

    # Build a unique WO code
    wo_code = f"{src}-{idx+1:06d}"

    return {
        'asset_code': str(machine).strip() if machine is not None else None,
        'wo_code': wo_code,
        'start_at': start_iso,
        'end_at': end_iso,
        'type': map_type_fr(type_panne) if type_panne is not None else 'corrective',
        'cause_text': str(cause).strip() if cause is not None else '',
        'technician': None,  # to be filled from Workload later
        'part_sku': str(row.get('[Pièce].Référence') or row.get('[Piece].Reference') or '').strip() or None,
        'part_name': str(row.get('[Pièce].Désignation') or row.get('[Piece].Designation') or '').strip() or None,
        'quantity': int(row.get('[Pièce].Quantité') or 0) if not pd.isna(row.get('[Pièce].Quantité')) else None,
    }


def dataframe_from_amdec(path: Path) -> pd.DataFrame:
    df = read_csv_auto(path)
    rows = []
    for i, r in df.iterrows():
        rows.append(build_wo_row('AMDEC', i, r))
    return pd.DataFrame(rows)


def dataframe_from_integrator(path: Path) -> pd.DataFrame:
    df = read_csv_auto(path)
    rows = []
    for i, r in df.iterrows():
        rows.append(build_wo_row('GMAO', i, r))
    return pd.DataFrame(rows)


def dataframe_from_workload(path: Path) -> pd.DataFrame:
    df = read_csv_auto(path)
    rows = []
    for i, r in df.iterrows():
        row = build_wo_row('WORKLOAD', i, r)
        # Compose technician full name
        nom = r.get("[MO interne].Nom")
        prenom = r.get("[MO interne].Prénom") or r.get("[MO interne].Prenom")
        tech = None
        if pd.notna(nom) or pd.notna(prenom):
            tech = f"{str(prenom or '').strip()} {str(nom or '').strip()}".strip()
        row['technician'] = tech if tech else None
        rows.append(row)
    return pd.DataFrame(rows)


def upsert_failure_modes_for_rows(supabase, df: pd.DataFrame, tenant_id: str, assets_map: dict):
    """Create simple failure_modes per (asset, cause/type) and link work_orders later by updating."""
    created = 0
    for _, r in df.iterrows():
        asset_code = r.get('asset_code')
        cause = r.get('cause_text')
        type_str = r.get('type')
        asset_id = assets_map.get(asset_code)
        if not asset_id:
            continue
        base_mode = (cause or '').strip() or type_str
        if not base_mode:
            continue
        # Check if exists
        try:
            res = supabase.table('failure_modes') \
                .select('id') \
                .eq('asset_id', asset_id) \
                .eq('failure_mode', base_mode) \
                .limit(1).execute()
            if res.data:
                continue
            # Create with default S,O,D
            fm = {
                'asset_id': asset_id,
                'component': 'N/A',
                'failure_mode': base_mode,
                'severity': 5,
                'occurrence': 5,
                'detection': 5,
                'rpn': 5*5*5,
            }
            supabase.table('failure_modes').insert(fm).execute()
            created += 1
        except Exception as e:
            print('⚠️ Failure mode upsert error:', e)
    return created


def link_work_orders_to_failure_modes(supabase, tenant_id: str):
    """Best-effort: set work_orders.failure_mode_id by matching (asset_id, cause_text) to failure_modes.failure_mode"""
    try:
        wo = supabase.table('work_orders').select('id, asset_id, cause_text').eq('tenant_id', tenant_id).execute().data
        for w in wo:
            cause = (w.get('cause_text') or '').strip()
            if not cause:
                continue
            res = supabase.table('failure_modes').select('id').eq('asset_id', w['asset_id']).eq('failure_mode', cause).limit(1).execute()
            if res.data:
                supabase.table('work_orders').update({'failure_mode_id': res.data[0]['id']}).eq('id', w['id']).execute()
    except Exception as e:
        print('⚠️ Linking WO to failure modes failed:', e)


def main():
    parser = argparse.ArgumentParser(description='Import Data_P folder into Supabase')
    parser.add_argument('--path', required=True, help='Path to Data_P folder containing CSV/XLSX')
    parser.add_argument('--tenant-id', required=False, help='Tenant UUID; if omitted, will try first account id')
    args = parser.parse_args()

    folder = Path(args.path)
    if not folder.exists() or not folder.is_dir():
        print(f"❌ Folder not found: {folder}")
        sys.exit(1)

    supabase = get_client()

    tenant_id = args.tenant_id
    if not tenant_id:
        # Try to get first account id as tenant
        try:
            res = supabase.table('accounts').select('id').limit(1).execute()
            tenant_id = res.data[0]['id'] if res.data else None
        except Exception:
            tenant_id = None
    if not tenant_id:
        print('❌ tenant_id is required and could not be guessed from accounts table')
        sys.exit(1)

    print(f"🔑 Using tenant_id: {tenant_id}")

    # Read files if present
    amdec_path = folder / 'AMDEC.csv'
    integrator_path = folder / 'GMAO_Integrator.csv'
    workload_path = folder / 'Workload.csv'
    dispo_path = folder / 'Dispo_MTBF_MTTR.xlsx'  # currently unused

    frames = []
    if amdec_path.exists():
        print('📥 Reading AMDEC.csv ...')
        frames.append(dataframe_from_amdec(amdec_path))
    if integrator_path.exists():
        print('📥 Reading GMAO_Integrator.csv ...')
        frames.append(dataframe_from_integrator(integrator_path))
    if workload_path.exists():
        print('📥 Reading Workload.csv ...')
        frames.append(dataframe_from_workload(workload_path))

    if not frames:
        print('❌ No supported files found in folder')
        sys.exit(1)

    df = pd.concat(frames, ignore_index=True)

    # Ensure required columns exist
    for col in ['asset_code','wo_code','start_at','end_at','type','cause_text','technician','part_sku','quantity']:
        if col not in df.columns:
            df[col] = None

    # Upserts and inserts
    print('\n🔄 Upserting reference data...')
    assets_map = upsert_assets(supabase, df, tenant_id)
    techs_map = upsert_technicians(supabase, df, tenant_id)

    # For parts, we need sku column; we also pass part_name but helper ignores; ok
    parts_map = upsert_spare_parts(supabase, df, tenant_id)

    print('\n🧾 Inserting work orders...')
    work_orders = insert_work_orders(supabase, df, tenant_id, assets_map, techs_map)

    print('\n🔩 Inserting part usages...')
    usages_count = insert_part_usages(supabase, df, work_orders, parts_map)

    print('\n⚙️  Creating failure modes from cause/type...')
    fm_created = upsert_failure_modes_for_rows(supabase, df, tenant_id, assets_map)
    link_work_orders_to_failure_modes(supabase, tenant_id)

    summary = {
        'success': True,
        'message': 'Data_P import completed',
        'stats': {
            'assets': len(assets_map),
            'technicians': len(techs_map),
            'work_orders': len(work_orders),
            'part_usages': usages_count,
            'failure_modes_created': fm_created,
        }
    }
    print(summary)

if __name__ == '__main__':
    main()
