
-- Create a test tenant
INSERT INTO public.tenants (id, company_name, city, state)
VALUES ('a0000000-0000-0000-0000-000000000001', 'Imobiliária Teste', 'Florianópolis', 'SC');

-- Create profile for the logged-in user
INSERT INTO public.profiles (id, tenant_id, full_name, role)
VALUES ('eda01464-1fd6-472d-bfb7-e96ca2711d4b', 'a0000000-0000-0000-0000-000000000001', 'Ian Veras', 'admin');

-- Create initial ai_agent_config for the tenant
INSERT INTO public.ai_agent_config (tenant_id)
VALUES ('a0000000-0000-0000-0000-000000000001');
