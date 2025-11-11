# Database Migration Instructions

## Step 1: Apply Migration to Supabase

You need to run the migration file in your Supabase SQL Editor:

### Option A: Using Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the entire contents of `apps/web/supabase/migrations/20241107_extend_schema.sql`
5. Paste into the SQL Editor
6. Click **Run** or press `Ctrl+Enter`
7. Verify success messages (should create 9 tables + 5 views)

### Option B: Using Supabase CLI
```powershell
# Navigate to web app directory
cd c:\Users\foot-\gmao\apps\web

# Apply migration (requires Supabase CLI installed)
supabase db push

# Or run specific migration
supabase db push --db-url "your-postgres-connection-string"
```

## Step 2: Verify Tables Were Created

Run this query in SQL Editor to verify:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'technicians', 
  'spare_parts', 
  'work_orders', 
  'part_usages', 
  'stock_movements', 
  'functions', 
  'failure_effects', 
  'actions'
);
```

Expected result: 8 rows

## Step 3: Verify Views Were Created

```sql
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public' 
AND table_name LIKE 'view_%';
```

Expected result: 5 rows (view_asset_kpis, view_technician_workload, view_reorder_status, view_part_demand, view_failure_frequencies)

## Next Steps

Once migration is applied, we'll continue with:
1. Creating the Upload page UI
2. Building the Python ETL script
3. Creating the Next.js API route
4. Wiring Dashboard/AMDEC/PDR to real data

---

**Note:** This migration extends your existing schema (doesn't drop any tables). Your current data in `assets`, `documents`, `failure_modes`, etc. remains intact.
