-- Migration: Extend schema for full GMAO linking
-- This builds on your existing tables (accounts, assets, documents, failure_modes, interventions)

-- ==================== NEW TABLES ====================

-- Technicians (link interventions to people)
CREATE TABLE IF NOT EXISTS public.technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  email text,
  skills jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Spare parts inventory
CREATE TABLE IF NOT EXISTS public.spare_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sku text NOT NULL,
  name text NOT NULL,
  category text,
  unit_cost numeric(10,2) DEFAULT 0,
  stock_on_hand integer DEFAULT 0,
  safety_stock integer DEFAULT 0,
  reorder_point integer DEFAULT 0,
  lead_time_days integer DEFAULT 7,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT spare_parts_tenant_sku_unique UNIQUE (tenant_id, sku)
);

-- Work orders (detailed intervention tracking)
CREATE TABLE IF NOT EXISTS public.work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  wo_code text NOT NULL,
  asset_id uuid REFERENCES public.assets(id),
  technician_id uuid REFERENCES public.technicians(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz,
  downtime_minutes integer,
  type text CHECK (type IN ('corrective', 'preventive', 'emergency', 'improvement')),
  cause_text text,
  failure_mode_id uuid REFERENCES public.failure_modes(id),
  description text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT work_orders_tenant_code_unique UNIQUE (tenant_id, wo_code)
);

-- Part usages (link work orders to consumed parts)
CREATE TABLE IF NOT EXISTS public.part_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.work_orders(id) ON DELETE CASCADE,
  part_id uuid NOT NULL REFERENCES public.spare_parts(id),
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Stock movements (audit trail for inventory changes)
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.spare_parts(id),
  movement_at timestamptz DEFAULT now(),
  type text CHECK (type IN ('in', 'out', 'adjust')),
  quantity integer NOT NULL,
  reason text,
  work_order_id uuid REFERENCES public.work_orders(id)
);

-- AMDEC Functions (Asset → Function → FailureMode hierarchy)
CREATE TABLE IF NOT EXISTS public.functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.assets(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- AMDEC Effects (separate table for structured effects)
CREATE TABLE IF NOT EXISTS public.failure_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_mode_id uuid NOT NULL REFERENCES public.failure_modes(id) ON DELETE CASCADE UNIQUE,
  local_effect text,
  system_effect text,
  safety_effect text,
  created_at timestamptz DEFAULT now()
);

-- AMDEC Actions (corrective/preventive actions per failure mode)
CREATE TABLE IF NOT EXISTS public.actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_mode_id uuid NOT NULL REFERENCES public.failure_modes(id) ON DELETE CASCADE,
  action text NOT NULL,
  owner text,
  due_date date,
  status text CHECK (status IN ('open', 'in-progress', 'done')) DEFAULT 'open',
  created_at timestamptz DEFAULT now()
);

-- ==================== INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_work_orders_asset ON public.work_orders(asset_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_tech ON public.work_orders(technician_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_tenant ON public.work_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_part_usages_wo ON public.part_usages(work_order_id);
CREATE INDEX IF NOT EXISTS idx_part_usages_part ON public.part_usages(part_id);
CREATE INDEX IF NOT EXISTS idx_failure_modes_asset ON public.failure_modes(asset_id);
CREATE INDEX IF NOT EXISTS idx_functions_asset ON public.functions(asset_id);

-- ==================== COMPUTED VIEWS ====================

-- View 1: Asset KPIs (MTBF, MTTR, Availability)
CREATE OR REPLACE VIEW view_asset_kpis AS
SELECT 
    a.id AS asset_id,
    a.name AS asset_name,
    a.type AS asset_type,
    a.tenant_id,
    
    -- Total failures (corrective + emergency)
    COUNT(CASE WHEN wo.type IN ('corrective', 'emergency') THEN 1 END) AS failure_count,
    
    -- MTBF = observation time / failures (in hours)
    CASE 
        WHEN COUNT(CASE WHEN wo.type IN ('corrective', 'emergency') THEN 1 END) > 0
        THEN ROUND(
            EXTRACT(EPOCH FROM (MAX(wo.end_at) - MIN(wo.start_at))) / 3600.0 
            / NULLIF(COUNT(CASE WHEN wo.type IN ('corrective', 'emergency') THEN 1 END), 0),
            1
        )
        ELSE NULL
    END AS mtbf_hours,
    
    -- MTTR = avg repair time for failures (in hours)
    ROUND(
        AVG(
            CASE WHEN wo.type IN ('corrective', 'emergency') AND wo.downtime_minutes IS NOT NULL
            THEN wo.downtime_minutes / 60.0
            ELSE NULL END
        )::numeric,
        2
    ) AS mttr_hours,
    
    -- Availability = (uptime / total_time) * 100
    CASE 
        WHEN EXTRACT(EPOCH FROM (MAX(wo.end_at) - MIN(wo.start_at))) > 0
        THEN ROUND(
            (1 - (SUM(COALESCE(wo.downtime_minutes, 0)) / 
                  NULLIF(EXTRACT(EPOCH FROM (MAX(wo.end_at) - MIN(wo.start_at))) / 60.0, 0)
            )) * 100,
            1
        )
        ELSE NULL
    END AS availability_pct,
    
    -- Last failure date
    MAX(CASE WHEN wo.type IN ('corrective', 'emergency') THEN wo.start_at END) AS last_failure_at,
    
    -- Total downtime (minutes)
    SUM(COALESCE(wo.downtime_minutes, 0)) AS total_downtime_minutes
    
FROM public.assets a
LEFT JOIN public.work_orders wo ON wo.asset_id = a.id
WHERE wo.start_at IS NOT NULL AND wo.end_at IS NOT NULL
GROUP BY a.id, a.name, a.type, a.tenant_id;

-- View 2: Technician Workload
CREATE OR REPLACE VIEW view_technician_workload AS
SELECT 
    t.id AS technician_id,
    t.name AS technician_name,
    t.tenant_id,
    
    -- Completed (end_at in past)
    COUNT(CASE WHEN wo.end_at < NOW() THEN 1 END) AS completed,
    
    -- In progress (started but not ended)
    COUNT(CASE WHEN wo.start_at <= NOW() AND (wo.end_at IS NULL OR wo.end_at > NOW()) THEN 1 END) AS in_progress,
    
    -- Planned (start_at in future)
    COUNT(CASE WHEN wo.start_at > NOW() THEN 1 END) AS planned,
    
    -- Utilization (% of time on tasks in last 30 days)
    ROUND(
        (SUM(COALESCE(wo.downtime_minutes, 0))::numeric / NULLIF((30 * 8 * 60), 0)) * 100,
        1
    ) AS utilization_pct
    
FROM public.technicians t
LEFT JOIN public.work_orders wo ON wo.technician_id = t.id
WHERE wo.start_at >= NOW() - INTERVAL '30 days' OR wo.start_at IS NULL
GROUP BY t.id, t.name, t.tenant_id;

-- View 3: Reorder Status (PDR alerts)
CREATE OR REPLACE VIEW view_reorder_status AS
SELECT 
    sp.id AS part_id,
    sp.tenant_id,
    sp.sku,
    sp.name,
    sp.category,
    sp.stock_on_hand,
    sp.safety_stock,
    sp.reorder_point,
    sp.lead_time_days,
    sp.unit_cost,
    
    -- Gap quantity (how much to order)
    GREATEST(0, sp.reorder_point - sp.stock_on_hand) AS gap_qty,
    
    -- Status flag
    CASE 
        WHEN sp.stock_on_hand < sp.safety_stock THEN 'critical'
        WHEN sp.stock_on_hand < sp.reorder_point THEN 'warning'
        ELSE 'good'
    END AS status,
    
    -- Monthly demand (from last 30 days part usages)
    COALESCE(usage.monthly_qty, 0) AS monthly_demand,
    
    -- Days to stockout (simple: stock / avg_daily_usage)
    CASE 
        WHEN usage.daily_qty > 0 
        THEN ROUND((sp.stock_on_hand::numeric / usage.daily_qty), 1)
        ELSE NULL
    END AS days_to_stockout
    
FROM public.spare_parts sp
LEFT JOIN (
    SELECT 
        pu.part_id,
        SUM(pu.quantity) AS monthly_qty,
        SUM(pu.quantity)::numeric / 30 AS daily_qty
    FROM public.part_usages pu
    JOIN public.work_orders wo ON wo.id = pu.work_order_id
    WHERE wo.start_at >= NOW() - INTERVAL '30 days'
    GROUP BY pu.part_id
) usage ON usage.part_id = sp.id;

-- View 4: Part Demand Forecast (historical consumption)
CREATE OR REPLACE VIEW view_part_demand AS
SELECT 
    sp.id AS part_id,
    sp.sku,
    sp.name,
    sp.tenant_id,
    
    -- Rolling averages
    COALESCE(SUM(CASE WHEN wo.start_at >= NOW() - INTERVAL '30 days' THEN pu.quantity END), 0) AS last_30d_qty,
    COALESCE(SUM(CASE WHEN wo.start_at >= NOW() - INTERVAL '90 days' THEN pu.quantity END), 0) AS last_90d_qty,
    COALESCE(SUM(CASE WHEN wo.start_at >= NOW() - INTERVAL '180 days' THEN pu.quantity END), 0) AS last_180d_qty,
    
    -- Monthly average
    ROUND(
        COALESCE(SUM(CASE WHEN wo.start_at >= NOW() - INTERVAL '90 days' THEN pu.quantity END), 0)::numeric / 3,
        1
    ) AS monthly_avg
    
FROM public.spare_parts sp
LEFT JOIN public.part_usages pu ON pu.part_id = sp.id
LEFT JOIN public.work_orders wo ON wo.id = pu.work_order_id
GROUP BY sp.id, sp.sku, sp.name, sp.tenant_id;

-- View 5: Failure Mode Frequencies (link AMDEC to work orders)
CREATE OR REPLACE VIEW view_failure_frequencies AS
SELECT 
    fm.id AS failure_mode_id,
    fm.asset_id,
    fm.component,
    fm.failure_mode,
    fm.severity,
    fm.occurrence,
    fm.detection,
    fm.rpn,
    
    -- Actual frequency from work orders
    COUNT(wo.id) AS actual_occurrences,
    
    -- Total cost (from part usages)
    COALESCE(SUM(pu.quantity * sp.unit_cost), 0) AS total_cost
    
FROM public.failure_modes fm
LEFT JOIN public.work_orders wo ON wo.failure_mode_id = fm.id
LEFT JOIN public.part_usages pu ON pu.work_order_id = wo.id
LEFT JOIN public.spare_parts sp ON sp.id = pu.part_id
GROUP BY fm.id, fm.asset_id, fm.component, fm.failure_mode, fm.severity, fm.occurrence, fm.detection, fm.rpn;

-- ==================== RLS POLICIES (optional, enable later) ====================

-- Enable Row Level Security on all tables (commented out for now)
-- ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.spare_parts ENABLE ROW LEVEL SECURITY;
-- etc.

-- Example policy (tenant-based isolation):
-- CREATE POLICY tenant_isolation_assets ON public.assets
--   USING (tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::uuid);

COMMENT ON VIEW view_asset_kpis IS 'Pre-computed KPIs per asset: MTBF, MTTR, Availability';
COMMENT ON VIEW view_technician_workload IS 'Workload metrics per technician: completed, in_progress, planned, utilization';
COMMENT ON VIEW view_reorder_status IS 'Spare parts reorder alerts with gap quantities and days to stockout';
COMMENT ON VIEW view_part_demand IS 'Historical demand patterns for forecasting';
COMMENT ON VIEW view_failure_frequencies IS 'AMDEC failure mode frequencies from actual work orders';
