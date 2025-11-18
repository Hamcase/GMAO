-- Create asset_kpis table for storing historical KPI metrics
-- This table stores MTBF, MTTR, Availability, and other metrics over time

CREATE TABLE IF NOT EXISTS public.asset_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  asset_code TEXT NOT NULL,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('mtbf', 'mttr', 'availability', 'utilization', 'oee')),
  metric_value NUMERIC(10, 2) NOT NULL,
  period TEXT, -- e.g., "2024-04", "Q1-2024", or original column name
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Indexes for performance
  CONSTRAINT unique_asset_metric_period UNIQUE (tenant_id, asset_code, metric_type, period)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_asset_kpis_tenant ON public.asset_kpis(tenant_id);
CREATE INDEX IF NOT EXISTS idx_asset_kpis_asset_code ON public.asset_kpis(asset_code);
CREATE INDEX IF NOT EXISTS idx_asset_kpis_metric_type ON public.asset_kpis(metric_type);
CREATE INDEX IF NOT EXISTS idx_asset_kpis_recorded_at ON public.asset_kpis(recorded_at);

-- Enable RLS
ALTER TABLE public.asset_kpis ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their tenant's KPIs"
  ON public.asset_kpis
  FOR SELECT
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can insert their tenant's KPIs"
  ON public.asset_kpis
  FOR INSERT
  WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Users can update their tenant's KPIs"
  ON public.asset_kpis
  FOR UPDATE
  USING (tenant_id = auth.uid());

CREATE POLICY "Users can delete their tenant's KPIs"
  ON public.asset_kpis
  FOR DELETE
  USING (tenant_id = auth.uid());

-- Add comment
COMMENT ON TABLE public.asset_kpis IS 'Historical KPI metrics (MTBF, MTTR, Availability) for assets';
