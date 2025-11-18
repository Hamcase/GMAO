-- Migration: Add custom_columns JSONB field to main tables
-- Purpose: Store unmapped columns from CSV/Excel uploads that don't fit standard schema
-- This ensures no data loss and allows future schema evolution

-- Add custom_columns to work_orders
ALTER TABLE work_orders 
ADD COLUMN IF NOT EXISTS custom_columns JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN work_orders.custom_columns IS 'Stores additional columns from import files that do not map to standard schema fields';

-- Add custom_columns to assets
ALTER TABLE assets 
ADD COLUMN IF NOT EXISTS custom_columns JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN assets.custom_columns IS 'Stores additional columns from import files that do not map to standard schema fields';

-- Add custom_columns to asset_kpis
ALTER TABLE asset_kpis 
ADD COLUMN IF NOT EXISTS custom_columns JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN asset_kpis.custom_columns IS 'Stores additional columns from import files that do not map to standard schema fields';

-- Add custom_columns to failure_modes
ALTER TABLE failure_modes 
ADD COLUMN IF NOT EXISTS custom_columns JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN failure_modes.custom_columns IS 'Stores additional columns from import files that do not map to standard schema fields';

-- Add custom_columns to functions (AMDEC)
ALTER TABLE functions 
ADD COLUMN IF NOT EXISTS custom_columns JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN functions.custom_columns IS 'Stores additional columns from import files that do not map to standard schema fields';

-- Create indexes for JSONB queries (optional, for performance if querying custom columns)
CREATE INDEX IF NOT EXISTS idx_work_orders_custom_columns ON work_orders USING GIN (custom_columns);
CREATE INDEX IF NOT EXISTS idx_assets_custom_columns ON assets USING GIN (custom_columns);
CREATE INDEX IF NOT EXISTS idx_asset_kpis_custom_columns ON asset_kpis USING GIN (custom_columns);
CREATE INDEX IF NOT EXISTS idx_failure_modes_custom_columns ON failure_modes USING GIN (custom_columns);
CREATE INDEX IF NOT EXISTS idx_functions_custom_columns ON functions USING GIN (custom_columns);

-- Example usage:
-- If CSV has column "Internal Notes" that doesn't map to schema:
-- custom_columns: {"Internal Notes": "Needs urgent attention", "Legacy Code": "WO-2023-001"}
-- Can query: SELECT * FROM work_orders WHERE custom_columns->>'Internal Notes' LIKE '%urgent%';
