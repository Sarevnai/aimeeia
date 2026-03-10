# Sincronização de Imóveis - Integração Vista CRM

Este documento descreve o fluxo, avanços, soluções e possíveis armadilhas na integração de propriedades entre o sistema **Aimee** e a API **Vista CRM**.

## 1. Arquitetura da Solução
- O frontend envia a chave da API e a URL para o supabase na tabela `tenants`.
- Botões interativos do painel de administração (`AdminTenantDetailPage.tsx`) acionam a Edge Function responsável.
- Edge Function `crm-sync-properties`:
  1. Descobre a URL correta e a Chave REST do lojista (Tenant).
  2. Aciona o endpoint de Carga (`/imoveis/listar`) com filtros específicos da paginador.
  3. Prepara um pacote assíncrono para o Supabase PostgreSQL.
  4. Realiza o `Upsert` massivo de forma segura usando conflitos no `external_id`.
- Edge Function auxiliar `generate-property-embedding` (Ativada via Database Webhook):
  1. Assiste a Tabela `properties` para inserções e atualizações.
  2. Extrai os textos do imóvel e aciona a OpenAI (`text-embedding-3-small` - 1536 dimensões).
  3. Salva a propriedade de volta para vetorização semântica (busca de IA).

## 2. Endpoints Core
Quando completados, a integração usa basicamente o formato RESTful:

- **Endpoint de Listagem Carga/Em lote**: 
  - `GET http://{SUA-URL}.vistahost.com.br/imoveis/listar`
- **Query Params Passados (`pesquisa`)**:
  - `fields`: `["Codigo", "Categoria", "Bairro", "Cidade", "ValorVenda", "ValorLocacao", "Dormitorios", "Suites", "Vagas", "AreaTotal", "AreaPrivativa", "Caracteristicas", "InfraEstrutura", "DataAtualizacao"]`
  - `paginacao`: `{"pagina": 1, "quantidade": 50}` (Em loop assíncrono interno para as seguintes páginas)
- **Cabeçalhos Exigidos (Headers)**:
  - `Accept: application/json`

## 3. Avanços

- **Vetorização Automática**: Criação de Webhooks do Banco de Dados em PostgreSQL para reagir instantaneamente quando as propriedades mudarem, mantendo o índice Semântico HNSW ultra rápido e inteligente.
- **Tipagem Automática**: Substituição do Extrator Customizado por leitura direta do JSON `fields` limitando o uso extremo de memória via Deno/Edge.
- **Estruturação Correta de Upserts**: Criação de `id`, `tenant_id` e restrições únicas (`UNIQUE(tenant_id, external_id)`) para que as cargas delta sejam indestrutíveis ao se repetirem no banco.

## 4. Resolução de Bugs Documentadas

Listagem de armadilhas e percalços ultrapassados durante a construção da conexão do Vista para Supabase Edge Network.

### Bug 1: Tipagem Exigida não Encontrada - O Caso do Singular 
* **Erro Ocorrido:** `{"status":400,"message":["Campo Dormitorio não está disponível. Consulte a documentação para obter os campos disponíveis."]}`
* **Por que Aconteceu?** A API da imobiliária (Vista) não aceitava o campo `Dormitorio` na busca (Property Projection) singular, pois ele sempre retorna plural (`Dormitorios`).
* **Como Resolvemos?** Corrigimos o payload enviado e removemos o mapeamento de erro das consultas. Extraímos exclusivamente `Dormitorios`.

### Bug 2: URL Formato Sem HTTP
* **Erro Ocorrido:** `Error: Invalid URL: 'lkaimobi-rest.vistahost.com.br...` no console do navegador e Deno Function.
* **Por que Aconteceu?** O Deno Edge exigia instanciar um path absoluto ao usar a ferramenta nativa do JS `fetch({url})`. Sem `http://` no começo, o executor explodia acusando malformação.
* **Como Resolvemos?** Injetamos uma função de limpeza no Início da Edge Function que avalia a string. Se não conter prefixo de protocolo, nós anexamos o `http://` manualmente, junto ao path `/imoveis/listar` caso não exista.

### Bug 3: Tipagem Vetorial SQL ('vector' does not exist)
* **Erro Ocorrido:** Ao publicar a tabela `properties`, o banco reclamou de `type "vector" does not exist (SQLSTATE 42704)`.
* **Por que Aconteceu?** O Supabase armazena a extensão PgVector sob um schema isolado batizado de `extensions`. A sintaxe tradicional do Postgres requer especificação.
* **Como Resolvemos?** Adicionamos a nomenclatura completa nas queries DDL de migrações: Usou de `vector(1536)` para `extensions.vector(1536)` permitindo a identificação do sistema.

### Bug 4: Logs Com "Cache" Após Correção 
* **Ocorrência Acidental:** Os botões da Interface Retornavam o mesmo erro (`Campo Dormitorio`), mesmo com o código novo estando implantado e testado positivamente contra a API no terminal. 
* **Por que Aconteceu?** As Funções Edge da Supabase tem cache de Borda global de propagação nos Data Centers (aprox. 30 seg a 1 Minuto) via Deno Deploy.
* **Como Resolvemos?** Orientamos a aguardar o refresh das zonas e forçar pelo painel administrativo novamente depois do teto de TTL ser extinguido.
