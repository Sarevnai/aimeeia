-- Script para sincronizar e criar perfis (public.profiles) para os usuários 
-- de autenticação (auth.users) que não foram criados corretamente.

DO $$
DECLARE
  default_tenant uuid;
BEGIN
  -- 1. Buscamos o primeiro tenant ativo para usar como padrão, 
  -- visto que 'tenant_id' na tabela 'profiles' não pode ser nulo (NOT NULL).
  SELECT id INTO default_tenant FROM public.tenants WHERE is_active = true LIMIT 1;

  -- Fallback se não houver um ativo
  IF default_tenant IS NULL THEN
      SELECT id INTO default_tenant FROM public.tenants LIMIT 1;
  END IF;

  -- Se realmente não houver nenhum tenant no banco, criamos um Tenant padrão para salvar o sistema.
  IF default_tenant IS NULL THEN
      RAISE NOTICE 'Nenhum tenant encontrado. Criando um Tenant Padrão (Aimee Base) para permitir a criação dos perfis.';
      
      INSERT INTO public.tenants (company_name, city, state, access_code, is_active)
      VALUES ('Aimee Padrão (Sistema)', 'São Paulo', 'SP', 'AIMEEADMIN', true)
      RETURNING id INTO default_tenant;
  END IF;

  -- 2. Inserimos todos os usuários que existem na base de Auth, 
  -- mas que faltam na base 'public.profiles'.
  INSERT INTO public.profiles (id, full_name, avatar_url, role, tenant_id)
  SELECT
    au.id,
    -- Se ele não tiver nome em raw_user_meta_data, usamos o prefixo do e-mail
    COALESCE(NULLIF(au.raw_user_meta_data->>'full_name', ''), 'Nome Padrão (' || split_part(au.email, '@', 1) || ')'),
    COALESCE(au.raw_user_meta_data->>'avatar_url', ''),
    -- Default para operator, caso não especificado no momento do cadastro do Auth
    CAST(COALESCE(NULLIF(au.raw_user_meta_data->>'role', ''), 'operator') AS public.user_role),
    -- Se no meta_data de auth tiver tenant, usamos ele. Se não, pegamos o tenant padrão encontrado/criado
    COALESCE(NULLIF(au.raw_user_meta_data->>'tenant_id', '')::uuid, default_tenant)
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.id = au.id
  WHERE p.id IS NULL;

  -- 3. Conclusão
  RAISE NOTICE 'Sincronização dos perfis concluída. Perfis órfãos foram atrelados ao tenant (ID: %).', default_tenant;
END $$;
