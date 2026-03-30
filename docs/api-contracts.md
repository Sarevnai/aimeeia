# Aimee.iA — API Contracts (Edge Functions)

**Generated:** 2026-03-30

---

## Auth Levels

| Level | Description |
|-------|-------------|
| **Public** | No auth required (webhooks, internal) |
| **JWT (code)** | JWT validated in function code |
| **Service Role** | Internal calls use `SUPABASE_SERVICE_ROLE_KEY` |

> **Note**: All functions deployed with `--no-verify-jwt`. Auth is handled in code where needed.

---

## 1. WhatsApp Messaging

### `whatsapp-webhook`
- **Method**: GET (verification), POST (incoming messages)
- **Auth**: Public (GET uses `WA_VERIFY_TOKEN`)
- **Purpose**: Entry point for all incoming WhatsApp messages
- **Request (GET)**: `?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=CHALLENGE`
- **Request (POST)**: Meta Cloud API webhook payload
- **Response**: `200 OK`
- **Side Effects**: Creates contact/conversation, saves message, invokes `ai-agent`

### `send-wa-message`
- **Method**: POST
- **Auth**: Public
- **Purpose**: Send text message via WhatsApp
- **Request Body**:
  ```json
  {
    "phone": "5511999999999",
    "message": "Hello!",
    "tenant_id": "uuid",
    "conversation_id": "uuid",
    "operator_name": "John" // optional
  }
  ```
- **Response**: `{ success: true, wa_message_id: "wamid.xxx" }`

### `send-wa-media`
- **Method**: POST
- **Auth**: Public
- **Purpose**: Send media (image/document/audio) via WhatsApp
- **Request Body**:
  ```json
  {
    "phone": "5511999999999",
    "media_type": "image|document|audio",
    "media_url": "https://...",
    "caption": "optional caption",
    "tenant_id": "uuid",
    "conversation_id": "uuid"
  }
  ```

### `send-wa-template`
- **Method**: POST
- **Auth**: Public
- **Purpose**: Send template message via WhatsApp
- **Request Body**:
  ```json
  {
    "phone": "5511999999999",
    "template_name": "template_slug",
    "template_language": "pt_BR",
    "components": [...],
    "tenant_id": "uuid",
    "campaign_result_id": "uuid" // optional
  }
  ```

### `manage-templates`
- **Method**: POST
- **Auth**: Public
- **Purpose**: CRUD for WABA message templates
- **Request Body**:
  ```json
  {
    "action": "sync|create|delete",
    "tenant_id": "uuid",
    "template_data": {...} // for create
  }
  ```

---

## 2. AI Agent

### `ai-agent`
- **Method**: POST
- **Auth**: Public (invoked internally by `whatsapp-webhook`)
- **Purpose**: Main AI orchestrator
- **Request Body**:
  ```json
  {
    "phone": "5511999999999",
    "message": "Quero alugar um apartamento",
    "tenant_id": "uuid",
    "conversation_id": "uuid",
    "contact_id": "uuid"
  }
  ```
- **Response**: `{ success: true }`
- **Side Effects**: Sends WhatsApp response, updates conversation_states, creates ai_traces

### `ai-agent-simulate`
- **Method**: POST
- **Auth**: Reads JWT (not enforced)
- **Purpose**: AI simulation for Lab (production parity, no WhatsApp send)
- **Request Body**:
  ```json
  {
    "phone": "sim_5511999999999",
    "message": "Procuro casa no Morumbi",
    "tenant_id": "uuid",
    "conversation_id": "uuid"
  }
  ```
- **Response**: `{ success: true, response: "...", metadata: {...} }`

### `ai-agent-analyze`
- **Method**: POST
- **Auth**: Public
- **Purpose**: Analyze single AI turn quality
- **Request Body**:
  ```json
  {
    "simulation_run_id": "uuid",
    "turn_index": 0,
    "user_message": "...",
    "ai_response": "...",
    "context": {...}
  }
  ```
- **Response**: `{ score: 8.5, analysis: "..." }`

### `ai-agent-analyze-batch`
- **Method**: POST
- **Auth**: Public
- **Purpose**: Analyze full conversation
- **Request Body**:
  ```json
  {
    "conversation_id": "uuid",
    "tenant_id": "uuid"
  }
  ```
- **Response**: `{ report_id: "uuid", avg_score: 7.2, turns: [...] }`

---

## 3. Team & Ticket Management

### `manage-team`
- **Method**: POST
- **Auth**: JWT validated (super_admin only)
- **Purpose**: User management CRUD
- **Request Body**:
  ```json
  {
    "action": "create|remove|update_role|reset_password|regenerate_code",
    "tenant_id": "uuid",
    "user_id": "uuid",        // for remove/update
    "email": "user@email.com", // for create
    "role": "admin|operator|viewer",
    "full_name": "Name",
    "department_code": "vendas" // optional
  }
  ```

### `manage-tickets`
- **Method**: POST
- **Auth**: JWT validated
- **Purpose**: Ticket CRUD
- **Request Body**:
  ```json
  {
    "action": "list|get_ticket|create|update|add_comment|list_categories|list_stages",
    "tenant_id": "uuid",
    "ticket_id": "uuid",     // for get/update/comment
    "data": {...}             // for create/update/comment
  }
  ```

---

## 4. CRM Integrations

### `crm-sync-properties`
- **Method**: POST
- **Auth**: Public
- **Purpose**: Full/delta property sync from Vista CRM
- **Request Body**:
  ```json
  {
    "tenant_id": "uuid",
    "mode": "full|delta" // optional, defaults to full
  }
  ```

### `vista-get-property`
- **Method**: POST
- **Auth**: Public
- **Request Body**: `{ "tenant_id": "uuid", "property_code": "12345" }`

### `vista-search-properties`
- **Method**: POST
- **Auth**: Public
- **Request Body**:
  ```json
  {
    "tenant_id": "uuid",
    "filters": {
      "type": "apartamento",
      "neighborhood": "Morumbi",
      "bedrooms": 3,
      "min_price": 500000,
      "max_price": 1000000
    }
  }
  ```

### `c2s-create-lead`
- **Method**: POST
- **Auth**: Public
- **Request Body**:
  ```json
  {
    "tenant_id": "uuid",
    "contact_id": "uuid",
    "conversation_id": "uuid",
    "property_id": "uuid" // optional
  }
  ```

### `c2s-test-connection`
- **Method**: POST
- **Auth**: Public
- **Request Body**: `{ "tenant_id": "uuid" }`
- **Response**: `{ success: true, tags: [...] }`

---

## 5. Utility Functions

### `follow-up-check`
- **Method**: POST (cron-triggered)
- **Auth**: Public
- **Purpose**: Send follow-up to inactive conversations (30+ min)
- **Request Body**: `{}` (no params needed)

### `generate-property-embedding`
- **Method**: POST (DB webhook)
- **Auth**: Public
- **Request Body**: Supabase DB webhook payload (property INSERT/UPDATE)

### `batch-regenerate-embeddings`
- **Method**: POST
- **Auth**: Public
- **Request Body**: `{ "tenant_id": "uuid" }` (optional, all tenants if omitted)

### `get-nearby-places`
- **Method**: POST
- **Auth**: Public
- **Request Body**: `{ "latitude": -23.55, "longitude": -46.63, "types": ["supermarket", "school"] }`

### `elevenlabs-voices`
- **Method**: POST
- **Auth**: Public
- **Request Body**: `{ "tenant_id": "uuid" }`
- **Response**: `{ voices: [{ voice_id, name, preview_url }] }`

### `portal-leads-webhook`
- **Method**: POST
- **Auth**: Public
- **Purpose**: Receive leads from real estate portals (ZAP, VivaReal, OLX)
- **Request Body**: Portal-specific lead payload

### `sync-catalog-xml`
- **Method**: POST
- **Auth**: Public
- **Request Body**: `{ "tenant_id": "uuid", "xml_url": "https://..." }`

### `process-xml-queue-item`
- **Method**: POST (DB webhook)
- **Auth**: Public
- **Request Body**: Supabase DB webhook payload (xml_sync_queue INSERT)
