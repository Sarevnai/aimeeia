-- Enable the pgvector extension if it's not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the properties table
CREATE TABLE IF NOT EXISTS public.properties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    external_id VARCHAR NOT NULL, -- Keep original string from CRM like 'AP1234'
    city VARCHAR,
    neighborhood VARCHAR,
    title VARCHAR, 
    price NUMERIC,
    bedrooms INTEGER DEFAULT 0,
    bathrooms INTEGER DEFAULT 0,
    parking_spaces INTEGER DEFAULT 0,
    area NUMERIC DEFAULT 0,
    description TEXT,
    raw_data JSONB, -- The complete JSON from the CRM for fallback/debugging
    embedding extensions.vector(1536), -- Text embeddings required for OpenAI semantic matching
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Ensure external_id is unique per tenant to allow deterministic UPSERTs
    UNIQUE(tenant_id, external_id)
);

-- Index the external_id for faster constraint matching 
CREATE INDEX IF NOT EXISTS idx_properties_external_id ON public.properties(tenant_id, external_id);

-- Create a semantic index on the vector embeddings for fast nearest neighbor search
-- Using ivfflat as it provides good recall vs performance with pgvector
CREATE INDEX IF NOT EXISTS properties_embedding_idx ON public.properties 
USING ivfflat (embedding extensions.vector_cosine_ops) WITH (lists = 100);

-- Enable RLS
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies
CREATE POLICY "Enable read access for all users" ON public.properties
    FOR SELECT USING (true);

-- Allow edge functions and service roles to manage properties
CREATE POLICY "Enable insert for service role only" ON public.properties
    FOR INSERT WITH CHECK (true);
    
CREATE POLICY "Enable update for service role only" ON public.properties
    FOR UPDATE USING (true);
    
CREATE POLICY "Enable delete for service role only" ON public.properties
    FOR DELETE USING (true);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for properties table
DROP TRIGGER IF EXISTS handle_properties_updated_at ON public.properties;
CREATE TRIGGER handle_properties_updated_at
    BEFORE UPDATE ON public.properties
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
