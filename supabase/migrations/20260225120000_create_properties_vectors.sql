-- Habilitar a extensão pgvector se ela não existir
create extension if not exists vector
with
  schema extensions;

-- Tabela para armazenar os imóveis com vetor
create table if not exists properties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade not null,
  external_id text, -- ID do imóvel no CRM/XML (para não duplicar)
  title text not null,
  description text,
  price numeric(15,2),
  type text, -- apartamento, casa, etc
  bedrooms integer,
  bathrooms integer,
  parking integer,
  area numeric(10,2),
  neighborhood text,
  city text,
  images jsonb, -- array de URLs
  url text, -- link do site
  status text default 'ativo',
  embedding vector(1536), -- Dimensão usada pelo text-embedding-3-small da OpenAI
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(tenant_id, external_id)
);

-- Índices HNSW para busca vetorial rápida no pgvector
-- Usando a métrica cosine vector_cosine_ops
create index if not exists properties_embedding_idx on properties using hnsw (embedding vector_cosine_ops);
create index if not exists properties_tenant_id_idx on properties (tenant_id);

-- Função de match (semantic search) via RPC
create or replace function match_properties (
  query_embedding vector(1536),
  match_tenant_id uuid,
  match_threshold float,
  match_count int,
  filter_max_price numeric default null,
  filter_tipo text default null
)
returns table (
  id uuid,
  external_id text,
  title text,
  description text,
  price numeric,
  type text,
  bedrooms int,
  neighborhood text,
  city text,
  images jsonb,
  url text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    p.id,
    p.external_id,
    p.title,
    p.description,
    p.price,
    p.type,
    p.bedrooms,
    p.neighborhood,
    p.city,
    p.images,
    p.url,
    1 - (p.embedding <=> query_embedding) as similarity
  from properties p
  where p.tenant_id = match_tenant_id
    and p.status = 'ativo'
    and 1 - (p.embedding <=> query_embedding) > match_threshold
    and (filter_max_price is null or p.price <= filter_max_price)
    and (filter_tipo is null or p.type ilike '%' || filter_tipo || '%')
  order by p.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- RLS
alter table public.properties enable row level security;

create policy "Usuários podem ver imóveis do seu tenant"
  on properties for select
  using (tenant_id = get_user_tenant_id());

create policy "Admins podem inserir/atualizar imóveis do seu tenant"
  on properties for all
  using (tenant_id = get_user_tenant_id() and auth.jwt() ->> 'user_role' = 'admin');

-- Mas queremos permitir que a Edge Function puxe tudo (com role service_role)
-- service_role_key ignora RLS automaticamente.
