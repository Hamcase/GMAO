-- Migration: Create documents table for upload tracking and audit trail
-- Purpose: Store metadata about every file upload (original file reference, processing status, results)

-- Drop table if it exists (clean slate)
DROP TABLE IF EXISTS documents CASCADE;

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- File identification
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'xlsx', 'csv', 'json'
  storage_path TEXT, -- Supabase Storage path (optional if using external storage)
  file_size_bytes BIGINT,
  
  -- Import metadata
  import_type TEXT NOT NULL, -- 'maintenance', 'kpi', 'amdec'
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Processing status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  
  -- Results and diagnostics
  import_results JSONB, -- {rows_processed: 100, assets_created: 5, kpis_inserted: 20, ...}
  column_mapping JSONB, -- {original_columns: [...], mapped_columns: {...}, unmapped_columns: [...]}
  error_log JSONB, -- Array of errors/warnings if any
  
  -- Versioning (if same file uploaded multiple times)
  version INTEGER DEFAULT 1,
  supersedes_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_documents_tenant_id ON documents(tenant_id);
CREATE INDEX idx_documents_uploaded_at ON documents(uploaded_at DESC);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_import_type ON documents(import_type);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);

-- Composite index for tenant's recent uploads by type
CREATE INDEX idx_documents_tenant_type_date ON documents(tenant_id, import_type, uploaded_at DESC);

-- Enable Row Level Security
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their tenant's documents
CREATE POLICY "Users can view own tenant documents"
  ON documents
  FOR SELECT
  USING (
    tenant_id = auth.uid()
  );

-- Users can insert documents for their tenant
CREATE POLICY "Users can upload documents to own tenant"
  ON documents
  FOR INSERT
  WITH CHECK (
    tenant_id = auth.uid()
  );

-- Users can update their tenant's documents (e.g., processing status)
CREATE POLICY "Users can update own tenant documents"
  ON documents
  FOR UPDATE
  USING (
    tenant_id = auth.uid()
  );

-- Users can delete their tenant's documents
CREATE POLICY "Users can delete own tenant documents"
  ON documents
  FOR DELETE
  USING (
    tenant_id = auth.uid()
  );

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_documents_updated_at();

-- Comment on table
COMMENT ON TABLE documents IS 'Tracks all file uploads with metadata, processing status, and audit trail for multi-tenant GMAO system';
