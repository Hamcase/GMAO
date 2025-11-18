-- Migration: Add tenant_id to AMDEC tables (functions, failure_modes)
-- Purpose: Enable multi-tenancy for AMDEC/FMEA data isolation

-- Add tenant_id to functions table
ALTER TABLE functions 
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Add tenant_id to failure_modes table
ALTER TABLE failure_modes 
ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create indexes for tenant filtering
CREATE INDEX IF NOT EXISTS idx_functions_tenant_id ON functions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_failure_modes_tenant_id ON failure_modes(tenant_id);

-- Backfill existing data with first tenant (if any exists)
-- This is safe because we cleared the database earlier
-- If you have data from multiple sources, this will assign all to first found tenant

DO $$ 
DECLARE
    first_tenant_id UUID;
BEGIN
    -- Get first tenant ID from assets table (should have data from gmao_integrator.csv)
    SELECT tenant_id INTO first_tenant_id FROM assets LIMIT 1;
    
    IF first_tenant_id IS NOT NULL THEN
        -- Update functions
        UPDATE functions SET tenant_id = first_tenant_id WHERE tenant_id IS NULL;
        
        -- Update failure_modes
        UPDATE failure_modes SET tenant_id = first_tenant_id WHERE tenant_id IS NULL;
        
        RAISE NOTICE 'Backfilled tenant_id with %', first_tenant_id;
    END IF;
END $$;

-- Make tenant_id NOT NULL after backfill
ALTER TABLE functions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE failure_modes ALTER COLUMN tenant_id SET NOT NULL;

COMMENT ON COLUMN functions.tenant_id IS 'Tenant isolation - each user/client has separate AMDEC functions';
COMMENT ON COLUMN failure_modes.tenant_id IS 'Tenant isolation - each user/client has separate failure modes';
