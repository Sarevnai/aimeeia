-- ========== AIMEE.iA — CULTURAL PROFILES (Wiki LLM) ==========
-- Banco de perfis culturais que a Aimee consulta para se conectar com o cliente
-- na linguagem, valores e referências dele. Multi-tenant: cada imobiliária pode
-- adicionar/customizar perfis relevantes pro território dela.

create table if not exists public.cultural_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade, -- null = global (todos tenants)
  profile_key text not null,                  -- ex: 'caicara', 'manezinho', 'gaucho_serrano'
  display_name text not null,                 -- ex: 'Caiçara / Manezinho da Ilha'
  summary text not null,                      -- 1-2 linhas, o que é
  origin_history text,                        -- raízes históricas
  geography text[],                           -- regiões/cidades/bairros onde concentra
  language_markers text[],                    -- gírias, vocativos, sotaques (sinais de detecção)
  surnames_common text[],                     -- sobrenomes típicos (heurística complementar)
  values_core text[],                         -- valores e cosmovisão
  customs text[],                             -- costumes, festas, rituais
  cuisine text[],                             -- pratos/bebidas marcantes
  music_arts text[],                          -- música, dança, expressão artística
  religion text,                              -- religiosidade
  tastes_property text[],                     -- gostos imobiliários (o que valoriza num imóvel)
  pain_points text[],                         -- sensibilidades, traumas, gentrificação etc
  do_list text[],                             -- como tratar (DO)
  dont_list text[],                           -- como NÃO tratar (DON'T)
  sample_phrases text[],                      -- frases que a Aimee pode usar pra criar rapport
  detection_keywords text[],                  -- palavras/frases no texto do lead que sinalizam o perfil
  detection_neighborhoods text[],             -- bairros que sinalizam o perfil
  notes text,                                 -- notas livres
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, profile_key)
);

create index if not exists cultural_profiles_tenant_idx on public.cultural_profiles(tenant_id) where active = true;
create index if not exists cultural_profiles_key_idx on public.cultural_profiles(profile_key) where active = true;

alter table public.cultural_profiles enable row level security;

-- Leitura: usuários do tenant ou super_admin; perfis globais (tenant_id null) lidos por todos
drop policy if exists cultural_profiles_select on public.cultural_profiles;
create policy cultural_profiles_select on public.cultural_profiles for select to authenticated
  using (
    tenant_id is null
    or tenant_id = public.get_user_tenant_id()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- Escrita: super_admin sempre; admin do tenant só nos perfis do próprio tenant
drop policy if exists cultural_profiles_write on public.cultural_profiles;
create policy cultural_profiles_write on public.cultural_profiles for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
    or (tenant_id = public.get_user_tenant_id() and exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')
    ))
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
    or (tenant_id = public.get_user_tenant_id() and exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')
    ))
  );

-- ========== SEED: CAIÇARA / MANEZINHO DA ILHA ==========
-- Perfil global (tenant_id null) — herdado por todas imobiliárias.
-- Foco litoral SP/RJ/PR/SC, com ênfase açoriana em Florianópolis (manezinho).

insert into public.cultural_profiles (
  tenant_id, profile_key, display_name, summary, origin_history,
  geography, language_markers, surnames_common, values_core, customs, cuisine,
  music_arts, religion, tastes_property, pain_points, do_list, dont_list,
  sample_phrases, detection_keywords, detection_neighborhoods, notes
) values (
  null,
  'caicara',
  'Caiçara / Manezinho da Ilha',
  'Populações tradicionais do litoral sul-sudeste brasileiro (SP, RJ, PR, SC), com forte raiz indígena tupi-guarani, portuguesa-açoriana e africana. No litoral catarinense — sobretudo Florianópolis — o caiçara assume o recorte "manezinho da ilha", herdeiro direto da imigração açoriana iniciada em 1748.',
  'Etimologia "caá-içara" (tupi: cerca de galhos para encurralar peixe). Mestiçagem entre povos originários (tupinambá, carijó), colonos portugueses (especialmente das ilhas dos Açores no caso de SC) e contribuição africana. Em Florianópolis, a Coroa portuguesa trouxe ~6.000 casais açorianos entre 1748-1756 para povoar a então Vila do Desterro — a base genética e cultural do "manezinho" atual.',
  array['Litoral norte e sul de SP (Ubatuba, Paraty, Ilhabela, Cananéia, Iguape)','Litoral RJ (Paraty, Angra dos Reis)','Litoral PR (Guaraqueçaba, Paranaguá, Ilha do Mel)','Litoral SC inteiro com epicentro em Florianópolis (manezinho), Laguna, São Francisco do Sul, Garopaba'],
  array['Uso de "tu" (não "você") com conjugação muitas vezes na 3ª pessoa: "tu vai", "tu fez"','Vocativos: "ô fia", "ô fio", "ô meu querido", "ô cumpade", "ô compadre"','Diminutivos constantes: "cafezinho", "horinha", "pouquinho", "rapidinho"','Interjeições: "barbaridade!", "nu!", "ô meu!", "tá tri" (SC), "ah, dá-le!"','Contrações e elisões típicas do manezinho: "sapassado" (sábado passado), "vô ali e vorto", "tu tá adonde?"','"R" levemente puxado (mas não caipira), "i" final aberto, fala rápida em ondas','Ritmo musical da fala, entonação cantada (herança açoriana)'],
  array['Silva','Souza','Cabral','Medeiros','Vieira','da Luz','dos Anjos','Espíndola','Heidrich','Garcia','Coelho','Machado','Pacheco','Goulart','Bittencourt','Amorim','Fernandes','de Bem'],
  array['Hospitalidade ("entra, toma um café")','Tempo lento, sem pressa ("vai com calma, ô")','Coletivismo e mutirão (herança da pesca e da roça comunitária)','Respeito aos mais velhos e à palavra empenhada','Ligação visceral com o mar, a lagoa e a terra herdada','Desconfiança saudável de "gente de fora" / "forasteiro"','Apego à casa de família e ao bairro de origem'],
  array['Festa do Divino Espírito Santo (com Império, bandeira e cortejo)','Boi-de-mamão (auto popular com personagens: vaqueiro, médico, urubu, cavalinho, bernunça)','Terno-de-Reis e Pão-por-Deus (cantorias de janeiro)','Festa de Nossa Senhora dos Navegantes (procissão marítima)','Festa de Sant''Ana, do Senhor dos Passos, da Lapa','Sequência da Tainha (maio-julho, pesca artesanal de arrasto na praia, ritual coletivo)','Ratoeira e cantigas de roda','Farra do Boi (ritual controverso, hoje proibido mas presente na memória)','Fandango caiçara (no recorte SP/PR/litoral norte SC)'],
  array['Tainha (assada, escalada, na telha, com pirão)','Sequência da tainha: peixe + pirão + farofa de banana + arroz','Camarão na moranga, casquinha de siri','Berbigão (típico açoriano da Ilha) e ostra de Ribeirão da Ilha','Moqueca caiçara (sem dendê, com banana-da-terra no recorte litoral norte)','Pirão de peixe, escabeche','Farinha de mandioca artesanal','Café com cuca, roscas e sonhos das padarias de bairro','Cachaça e biritas locais'],
  array['Boi-de-mamão e bandinhas','Cantorias de Reis e Divino','Renda de bilro (artesanato manezinho icônico)','Cestaria, redes de pesca, canoa de um pau só','Manifestações modernas: pagode da ilha, samba do mané'],
  'Catolicismo popular sincrético com forte devoção mariana (N.Sa. dos Navegantes, da Lapa, do Rosário). Benzedeiras, simpatias, promessas. Pequena presença de religiões afro-brasileiras no recorte SP/RJ. Crescente pentecostalismo nas últimas décadas.',
  array['Proximidade do mar, lagoa ou costão','Quintal pra horta, fruta, galinha — não só "área externa"','Varanda/alpendre pra receber visita e tomar café','Vizinhança conhecida, comunidade ("aqui todo mundo se conhece")','Igreja, padaria e mercadinho a pé','Casa de chão (térrea) preferida a apartamento alto','Construção sólida, "feita pra ficar pros filhos"','Garagem coberta pro carro e pro barco/caiaque','Em Florianópolis: bairros tradicionais como Ribeirão da Ilha, Santo Antônio de Lisboa, Sambaqui, Costa da Lagoa, Pântano do Sul, Barra da Lagoa, Costa de Dentro, Ratones'],
  array['Especulação imobiliária empurrou caiçaras de áreas litorâneas pra morros e periferias','Sensação de "perder a ilha" pra turistas e gente de fora','Descaracterização arquitetônica (casas açorianas viraram pousadas)','Pressão pra vender terra de família ("é herança, ô")','Ser tratado como "atrasado", "preguiçoso" ou folclore turístico','Pressa, frieza corporativa e formalidade excessiva','Gírias paulistanas/cariocas soam invasivas'],
  array['Tratar por "tu" se o lead usar "tu"','Usar diminutivos com naturalidade ("uma visitinha", "um cafezinho")','Reconhecer o bairro com afeto ("Ribeirão é uma graça, né?")','Respeitar o tempo de decisão — não pressionar','Valorizar quintal, vista, vizinhança, não só m² e preço','Mencionar o que faz sentido: feira, padaria de bairro, igreja, vista pro mar/lagoa','Se o lead falar de "casa da família", tratar com gravidade afetiva'],
  array['Não usar "você" formal o tempo todo se o lead já abriu com "tu"','Não despejar jargão imobiliário corporativo ("ROI", "valorização patrimonial") de cara','Não tratar pesca/roça/casa antiga como "atraso"','Não pressionar com escassez artificial ("tem que decidir hoje")','Não usar gírias paulistanas/cariocas ("mano", "tipo assim", "cara")','Não desprezar bairros tradicionais em favor de condomínios fechados de luxo se o cliente claramente é raiz'],
  array['"Ô, que bom te ver por aqui!"','"Calma, sem pressa — tu me conta o que tu tá procurando que a gente vai junto"','"Tem um cantinho ali no Ribeirão que parece feito pra ti"','"Esse imóvel tem um quintalzinho que dá pra fazer horta, viu?"','"A vizinhança ali é tranquila, todo mundo se conhece"','"Vou te mandar umas opções e tu vê com calma, tá?"'],
  array['tu','ô fia','ô fio','manezinho','mané','ilha','lagoa','ribeirão','tainha','açoriano','barbaridade','sapassado','vô ali e vorto','quintal','horta','casa de família','herança','vista pro mar','costão','rendeira','boi-de-mamão','divino','navegantes'],
  array['Ribeirão da Ilha','Santo Antônio de Lisboa','Sambaqui','Costa da Lagoa','Pântano do Sul','Costa de Dentro','Barra da Lagoa','Ratones','Armação','Pantanal','Saco dos Limões','Caieira da Barra do Sul','Lagoa da Conceição (parte tradicional)'],
  'Perfil mais provável quando o lead é nativo de Florianópolis (manezinho da ilha) ou litoral SP/PR/SC. Sinais combinados: uso de "tu", sobrenome açoriano, bairro tradicional, menção a pesca/lagoa/herança de família, ritmo de fala lento. Em caso de dúvida, comece neutro e ajuste o tom conforme o lead se revela.'
)
on conflict (tenant_id, profile_key) do update set
  display_name = excluded.display_name,
  summary = excluded.summary,
  origin_history = excluded.origin_history,
  geography = excluded.geography,
  language_markers = excluded.language_markers,
  surnames_common = excluded.surnames_common,
  values_core = excluded.values_core,
  customs = excluded.customs,
  cuisine = excluded.cuisine,
  music_arts = excluded.music_arts,
  religion = excluded.religion,
  tastes_property = excluded.tastes_property,
  pain_points = excluded.pain_points,
  do_list = excluded.do_list,
  dont_list = excluded.dont_list,
  sample_phrases = excluded.sample_phrases,
  detection_keywords = excluded.detection_keywords,
  detection_neighborhoods = excluded.detection_neighborhoods,
  notes = excluded.notes,
  updated_at = now();
