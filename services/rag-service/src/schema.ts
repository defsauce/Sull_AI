export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS rag_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  collection_id UUID NOT NULL,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rag_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES rag_documents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  collection_id UUID NOT NULL,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  token_estimate INT NOT NULL,
  lexical_score REAL NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_collection ON rag_chunks (collection_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_tenant ON rag_chunks (tenant_id);
`;
