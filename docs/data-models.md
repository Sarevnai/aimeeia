# Aimee.iA — Data Models

**Generated:** 2026-03-30
**Source:** `src/integrations/supabase/types.ts` (auto-generated) + migrations

---

## Database Overview

- **Engine**: PostgreSQL (Supabase-hosted)
- **Tables**: 31
- **RPC Functions**: 2
- **Enums**: 5
- **Extensions**: pgvector (for property embeddings)
- **RLS**: Enabled on all tables via `tenant_id = get_user_tenant_id()`

---

## Enums

| Enum | Values |
|------|--------|
| `conversation_status` | `active`, `waiting`, `closed`, `archived` |
| `department_type` | `vendas`, `locacao`, `administrativo`, `remarketing` |
| `message_direction` | `inbound`, `outbound` |
| `triage_stage` | `greeting`, `name_confirmation`, `department_selection`, `completed` |
| `user_role` | `admin`, `operator`, `viewer`, `super_admin` |

---

## Core Tables

### `tenants`
Multi-tenant organizations.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Tenant ID |
| company_name | text | Company display name |
| wa_phone_number_id | text | WhatsApp Business phone ID |
| wa_business_account_id | text | WABA ID |
| wa_access_token | text | Meta API access token |
| access_code | text | Tenant join code |
| created_at | timestamptz | Creation timestamp |

### `profiles`
Users linked to `auth.users`.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK, FK → auth.users) | User ID |
| tenant_id | uuid (FK → tenants) | Tenant (null for super_admin) |
| full_name | text | Display name |
| avatar_url | text | Profile image URL |
| role | user_role | Permission level |
| department_code | department_type | Locked department (operators) |
| created_at | timestamptz | Creation timestamp |

### `conversations`
WhatsApp conversation threads.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Conversation ID |
| tenant_id | uuid (FK → tenants) | Tenant |
| contact_id | uuid (FK → contacts) | Contact |
| status | conversation_status | Current status |
| department_code | department_type | Assigned department |
| channel_source | text | Origin channel (whatsapp, portal, etc.) |
| ai_enabled | boolean | AI agent active |
| stage_id | uuid (FK → conversation_stages) | Pipeline stage |
| assigned_to | uuid (FK → profiles) | Assigned operator |
| created_at / updated_at | timestamptz | Timestamps |

### `messages`
Individual messages in conversations.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Message ID |
| conversation_id | uuid (FK → conversations) | Parent conversation |
| tenant_id | uuid (FK → tenants) | Tenant |
| direction | message_direction | inbound/outbound |
| content | text | Message text |
| media_url | text | Media attachment URL |
| media_type | text | Media type (image/audio/document) |
| wa_message_id | text | WhatsApp message ID (dedup) |
| sender_name | text | Sender display name |
| sender_type | text | ai/operator/system |
| created_at | timestamptz | Timestamp |

### `contacts`
Leads and contacts.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Contact ID |
| tenant_id | uuid (FK → tenants) | Tenant |
| phone | text | Phone number |
| name | text | Contact name |
| email | text | Email |
| neighborhood | text | Neighborhood |
| city | text | City |
| crm_id | text | External CRM ID |
| crm_status | text | CRM status |
| crm_archive_reason | text | Archive reason |
| crm_natureza | text | Lead nature |
| created_at / updated_at | timestamptz | Timestamps |

---

## AI Tables

### `ai_agent_config`
Per-tenant AI configuration.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Config ID |
| tenant_id | uuid (FK → tenants) | Tenant |
| provider | text | AI provider (openai/anthropic/google) |
| model | text | Model name |
| api_key_encrypted | text | Encrypted API key |
| agent_name | text | AI persona name |
| tone | text | Response tone |
| greeting_message | text | Initial greeting |
| fallback_message | text | Fallback response |
| triage_config | jsonb | Triage flow configuration |
| website_url | text | Tenant website |
| created_at / updated_at | timestamptz | Timestamps |

### `ai_directives`
System prompts by agent type.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Directive ID |
| tenant_id | uuid (FK → tenants) | Tenant |
| agent_type | text | comercial/admin/remarketing |
| directive_text | text | System prompt content |
| version | integer | Version number |
| is_active | boolean | Active flag |
| created_at / updated_at | timestamptz | Timestamps |

### `conversation_states`
AI conversation state (persisted between messages).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | State ID |
| conversation_id | uuid (FK → conversations) | Conversation |
| tenant_id | uuid (FK → tenants) | Tenant |
| triage_stage | triage_stage | Current triage step |
| active_module | text | Active AI module slug |
| module_history | jsonb | Module activation history |
| department_code | department_type | Selected department |
| last_ai_messages | jsonb | Recent AI responses (anti-loop) |
| follow_up_count | integer | Follow-up messages sent |
| last_follow_up_at | timestamptz | Last follow-up time |
| updated_at | timestamptz | Last update |

### `ai_traces`
Observability traces for AI calls.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Trace ID |
| tenant_id | uuid (FK → tenants) | Tenant |
| conversation_id | uuid (FK → conversations) | Conversation |
| provider | text | AI provider used |
| model | text | Model used |
| input_tokens | integer | Input token count |
| output_tokens | integer | Output token count |
| estimated_cost | numeric | Estimated USD cost |
| latency_ms | integer | Response latency |
| tools_called | jsonb | Tools executed |
| created_at | timestamptz | Timestamp |

### `lead_qualification`
Lead qualification data extracted by AI.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Qualification ID |
| conversation_id | uuid (FK → conversations) | Conversation |
| tenant_id | uuid (FK → tenants) | Tenant |
| interest | text | Buy/rent interest |
| property_type | text | Property type preference |
| neighborhood | text | Preferred neighborhood |
| bedrooms | integer | Bedrooms needed |
| budget_min / budget_max | numeric | Budget range |
| score | integer | Qualification score (0-100) |
| tags | jsonb | Auto-generated tags |
| detected_timeline | text | Urgency timeline |
| created_at / updated_at | timestamptz | Timestamps |

---

## Business Tables

### `properties`
Real estate listings (synced from Vista CRM or XML feeds).

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Property ID |
| tenant_id | uuid (FK → tenants) | Tenant |
| external_code | text | CRM property code |
| title | text | Property title |
| type | text | Property type |
| neighborhood | text | Neighborhood |
| city | text | City |
| bedrooms | integer | Number of bedrooms |
| bathrooms | integer | Number of bathrooms |
| area | numeric | Area (m²) |
| price_sale | numeric | Sale price |
| price_rent | numeric | Rent price |
| description | text | Full description |
| images | jsonb | Image URLs array |
| embedding | vector(768) | Gemini embedding (pgvector) |
| latitude / longitude | numeric | Coordinates |
| crm_source | text | Source CRM (vista/xml) |
| created_at / updated_at | timestamptz | Timestamps |

### `campaigns` / `campaign_results`
WhatsApp mass campaigns.

| Table | Key Columns |
|-------|-------------|
| campaigns | id, tenant_id, name, template_name, status, campaign_type, sent_count, delivered_count |
| campaign_results | id, campaign_id, phone, status (sent/delivered/read/failed), wa_message_id |

### `tickets` / `ticket_comments` / `ticket_stages` / `ticket_categories`
Support ticket system.

| Table | Key Columns |
|-------|-------------|
| tickets | id, tenant_id, title, description, category_id, stage_id, priority, assigned_to, contact_id, conversation_id |
| ticket_comments | id, ticket_id, author_id, content |
| ticket_stages | id, name, position, color |
| ticket_categories | id, name, description |

### `developments`
Property developments (empreendimentos).

| Key Columns | Description |
|-------------|-------------|
| id, tenant_id, name | Basic info |
| developer, status | Developer and status |
| address, city, neighborhood | Location |
| price_min, price_max | Price range |
| hero_image_url | Main image |
| differentials, amenities | Tags (jsonb) |
| unit_types, faq | Structured data (jsonb) |
| ai_instructions | AI-specific instructions |

---

## RPC Functions

### `lookup_tenant_by_access_code(code text)`
- **Returns**: Tenant ID if code is valid
- **Used by**: AuthPage (signup flow)

### `match_properties(query_embedding vector, match_threshold float, match_count int, p_tenant_id uuid)`
- **Returns**: Properties matching semantic similarity
- **Used by**: AI agent property search tool

---

## Key Relationships

```
tenants ──┬── profiles (users)
          ├── conversations ──┬── messages
          │                   ├── conversation_states
          │                   ├── conversation_events
          │                   └── lead_qualification
          ├── contacts ←── conversations.contact_id
          ├── properties (with embeddings)
          ├── developments
          ├── campaigns ── campaign_results
          ├── tickets ──┬── ticket_comments
          │             ├── ticket_stages
          │             └── ticket_categories
          ├── ai_agent_config
          ├── ai_directives
          ├── ai_behavior_config
          ├── ai_department_configs
          ├── ai_modules
          ├── ai_error_log
          ├── ai_traces
          ├── whatsapp_templates
          ├── owner_contacts ── owner_update_campaigns ── owner_update_results
          └── portal_leads_log
```
