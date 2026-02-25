-- 1. Corrige o loop infinito do Banco de Dados (PostgREST 500)
-- A função antiga usava LANGUAGE SQL e criava uma recursão inifinita.
-- Reescrevendo em plpgsql, o Postgres isola o contexto e permite
-- que a checagem do RLS ocorra sem travar a tela principal da Aimee.

CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.profiles WHERE id = auth.uid();
  RETURN v_tenant_id;
END;
$$;

-- 2. Recria a Trigger de criação de usuários.
-- Isso vai garantir que quando alguém fizer SignUp no App, 
-- a linha no `public.profiles` seja gerada automaticamente, evitando
-- que usuários futuros caiam na tela preta de "Perfil não localizado".

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  default_tenant uuid;
BEGIN
  -- Tenta pegar o tenant que o auth.signUp enviou nos metadata
  default_tenant := nullif(new.raw_user_meta_data->>'tenant_id', '')::uuid;
  
  -- Se o cadastro não enviou tenant_id, busca o primeiro Ativo (prevenindo falha NOT NULL)
  IF default_tenant IS NULL THEN
      SELECT id INTO default_tenant FROM public.tenants WHERE is_active = true LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, full_name, avatar_url, role, tenant_id)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'avatar_url', ''),
    CAST(COALESCE(new.raw_user_meta_data->>'role', 'operator') AS public.user_role),
    default_tenant
  );
  RETURN new;
END;
$$;

-- Dropa a trigger antiga, se existir, para não duplicar
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Cria novamente
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
