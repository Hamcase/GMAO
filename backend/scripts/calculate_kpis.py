#!/usr/bin/env python3
"""
KPI Calculation Script
Calculates and populates asset_kpis table from work_orders data.

This script analyzes work orders to calculate:
- Availability (uptime percentage)
- MTBF (Mean Time Between Failures) in hours
- MTTR (Mean Time To Repair) in hours

Usage:
    python calculate_kpis.py --tenant-id <uuid> [--period YYYY-MM]
"""

import argparse
import sys
import json
from datetime import datetime, timezone
from collections import defaultdict
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

try:
    from supabase import create_client, Client
except ImportError:
    print("ERROR: supabase not installed. Run: pip install supabase")
    sys.exit(1)

# Supabase connection
SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL') or os.getenv('SUPABASE_URL', '')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_KEY', '')

def init_supabase() -> Client:
    """Initialize Supabase client."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError(
            "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars."
        )
    return create_client(SUPABASE_URL, SUPABASE_KEY)

def calculate_kpis_for_period(supabase: Client, tenant_id: str, period: str = None):
    """
    Calculate KPIs for a given period (YYYY-MM format).
    If period is None, calculates for all months with work orders.
    """
    print(f"🔍 Fetching work orders for tenant {tenant_id}...", file=sys.stderr)
    
    # Fetch all work orders for the tenant
    query = supabase.table('work_orders').select('*').eq('tenant_id', tenant_id)
    
    if period:
        # Filter by period (YYYY-MM)
        start_date = f"{period}-01"
        end_date = f"{period}-31"  # Simplified, will match any day in month
        query = query.gte('start_at', start_date).lte('start_at', end_date)
    
    result = query.execute()
    
    if not result.data:
        print("⚠️  No work orders found", file=sys.stderr)
        return []
    
    work_orders = result.data
    print(f"✅ Found {len(work_orders)} work orders", file=sys.stderr)

    # Build a mapping from asset_id -> asset_code/name to avoid parsing from wo_code
    asset_name_by_id = {}
    try:
        assets_res = supabase.table('assets').select('id,name').eq('tenant_id', tenant_id).execute()
        if assets_res.data:
            asset_name_by_id = {row['id']: row.get('name') for row in assets_res.data}
        print(f"🔗 Loaded {len(asset_name_by_id)} assets for mapping", file=sys.stderr)
    except Exception as e:
        print(f"⚠️  Failed to load assets for mapping, will fallback to wo_code parsing: {e}", file=sys.stderr)
    
    # Group work orders by asset and period (month)
    asset_periods = defaultdict(lambda: {
        'work_orders': [],
        'total_downtime': 0,
        'corrective_count': 0,
        'preventive_count': 0,
    })
    
    for wo in work_orders:
        if not wo.get('start_at') or not wo.get('wo_code'):
            continue
        
        # Prefer asset_id -> asset name mapping, fallback to parsing wo_code
        asset_code = None
        asset_id = wo.get('asset_id')
        if asset_id and asset_id in asset_name_by_id:
            asset_code = asset_name_by_id[asset_id]
        else:
            wo_code = wo['wo_code']
            parts = wo_code.split('-')
            asset_code = parts[1] if len(parts) > 1 else 'UNKNOWN'
        
        # Extract period (YYYY-MM)
        start_at = wo['start_at']
        wo_period = start_at[:7] if isinstance(start_at, str) else start_at.strftime('%Y-%m')
        
        # Group by asset_code + period
        key = (asset_code, wo_period)
        asset_periods[key]['work_orders'].append(wo)
        
        # Accumulate downtime
        downtime = wo.get('downtime_minutes', 0) or 0
        asset_periods[key]['total_downtime'] += downtime
        
        # Count by type
        wo_type = (wo.get('type') or 'corrective').lower()
        if 'preventive' in wo_type or 'prev' in wo_type:
            asset_periods[key]['preventive_count'] += 1
        else:
            asset_periods[key]['corrective_count'] += 1
    
    print(f"📊 Calculating KPIs for {len(asset_periods)} asset-periods...", file=sys.stderr)
    
    # Calculate KPIs for each asset-period
    kpis_to_insert = []
    periods_set = set()
    
    for (asset_code, period_str), data in asset_periods.items():
        wos = data['work_orders']
        total_downtime_hours = data['total_downtime'] / 60.0  # Convert minutes to hours
        corrective_count = data['corrective_count']
        preventive_count = data['preventive_count']
        
        # MTBF: Mean Time Between Failures (only corrective)
        # Total operating time / number of failures
        # Assume 720 hours per month (30 days * 24 hours)
        hours_in_month = 720
        mtbf = hours_in_month / corrective_count if corrective_count > 0 else hours_in_month
        
        # MTTR: Mean Time To Repair (total downtime / number of repairs)
        mttr = total_downtime_hours / (corrective_count + preventive_count) if (corrective_count + preventive_count) > 0 else 0
        
        # Availability: (uptime / total time) * 100
        # Uptime = total time - total downtime
        uptime_hours = hours_in_month - total_downtime_hours
        availability = uptime_hours / hours_in_month if hours_in_month > 0 else 0
        availability = max(0, min(1, availability))  # Clamp between 0 and 1
        
        # Create KPI entries for each metric type
        base_kpi = {
            'tenant_id': tenant_id,
            'asset_code': asset_code,
            'period': period_str,  # Store as YYYY-MM
        }
        periods_set.add(period_str)
        
        # Availability KPI
        kpis_to_insert.append({
            **base_kpi,
            'metric_type': 'availability',
            'metric_value': availability,
        })
        
        # MTBF KPI
        kpis_to_insert.append({
            **base_kpi,
            'metric_type': 'mtbf',
            'metric_value': mtbf,
        })
        
        # MTTR KPI
        kpis_to_insert.append({
            **base_kpi,
            'metric_type': 'mttr',
            'metric_value': mttr,
        })
        
        print(f"  📈 {asset_code} ({period_str}): Availability={availability*100:.1f}%, MTBF={mtbf:.1f}h, MTTR={mttr:.1f}h", file=sys.stderr)
    
    # Insert KPIs into asset_kpis table (clean per-period for this tenant to avoid duplicates)
    if kpis_to_insert:
        print(f"\n💾 Inserting {len(kpis_to_insert)} KPI records...", file=sys.stderr)
        
        # Delete existing KPIs for the affected periods for this tenant to avoid duplicates
        try:
            periods_list = sorted(list(periods_set))
            if period:
                # If a single period was requested, keep behavior
                supabase.table('asset_kpis').delete().eq('tenant_id', tenant_id).like('period', f"{period}%").execute()
            else:
                # Delete only the periods we are about to insert
                for i in range(0, len(periods_list), 100):
                    chunk = periods_list[i:i+100]
                    supabase.table('asset_kpis').delete().eq('tenant_id', tenant_id).in_('period', chunk).execute()
            print(f"🧹 Cleared existing KPIs for {len(periods_set)} period(s)", file=sys.stderr)
        except Exception as e:
            print(f"⚠️  Failed to clear existing KPIs before insert: {e}", file=sys.stderr)
        
        # Insert in batches of 100
        batch_size = 100
        for i in range(0, len(kpis_to_insert), batch_size):
            batch = kpis_to_insert[i:i+batch_size]
            try:
                supabase.table('asset_kpis').insert(batch).execute()
                print(f"  ✅ Inserted batch {i//batch_size + 1}/{(len(kpis_to_insert) + batch_size - 1)//batch_size}", file=sys.stderr)
            except Exception as e:
                print(f"  ❌ Error inserting batch: {e}", file=sys.stderr)
    
    print(f"\n✅ KPI calculation complete! {len(kpis_to_insert)} records inserted.", file=sys.stderr)
    return kpis_to_insert

def main():
    parser = argparse.ArgumentParser(description='Calculate KPIs from work orders')
    parser.add_argument('--tenant-id', required=True, help='Tenant UUID')
    parser.add_argument('--period', help='Period in YYYY-MM format (optional, calculates all if omitted)')
    
    args = parser.parse_args()
    
    # Initialize Supabase
    try:
        supabase = init_supabase()
        print(f"✅ Connected to Supabase: {SUPABASE_URL[:30]}...", file=sys.stderr)
    except ValueError as e:
        error_msg = str(e)
        print(f"❌ {error_msg}", file=sys.stderr)
        print(json.dumps({'success': False, 'message': error_msg}))
        sys.exit(1)
    
    # Calculate KPIs
    try:
        kpis = calculate_kpis_for_period(supabase, args.tenant_id, args.period)
        print(json.dumps({
            'success': True,
            'message': f'Calculated {len(kpis)} KPI records',
            'count': len(kpis)
        }))
    except Exception as e:
        error_msg = f"Failed to calculate KPIs: {str(e)}"
        print(f"❌ {error_msg}", file=sys.stderr)
        print(json.dumps({'success': False, 'message': error_msg}))
        sys.exit(1)

if __name__ == '__main__':
    main()
