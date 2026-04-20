-- Analytics views for DNC (Do Not Contact) contacts.
-- Used by Admin → Tenant → aba DNC.

CREATE OR REPLACE VIEW v_dnc_contacts AS
SELECT
  ct.id AS contact_id,
  ct.tenant_id,
  ct.phone,
  ct.name,
  ct.dnc_reason,
  ct.dnc_at,
  ct.c2s_lead_id,
  ct.assigned_broker_id,
  b.full_name AS broker_name,
  ct.crm_natureza,
  ct.crm_source,
  ct.crm_archive_reason,
  (SELECT c.source FROM conversations c WHERE c.contact_id = ct.id ORDER BY c.last_message_at DESC NULLS LAST LIMIT 1) AS last_conversation_source,
  (SELECT c.department_code::text FROM conversations c WHERE c.contact_id = ct.id ORDER BY c.last_message_at DESC NULLS LAST LIMIT 1) AS last_conversation_dept,
  (SELECT c.campaign_id FROM conversations c WHERE c.contact_id = ct.id ORDER BY c.last_message_at DESC NULLS LAST LIMIT 1) AS last_conversation_campaign,
  (SELECT LEFT(m.body, 280)
     FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.contact_id = ct.id AND m.direction = 'inbound'
     ORDER BY m.created_at DESC LIMIT 1) AS last_inbound,
  (SELECT m.created_at
     FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE c.contact_id = ct.id AND m.direction = 'inbound'
     ORDER BY m.created_at DESC LIMIT 1) AS last_inbound_at,
  (SELECT COUNT(*) FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE c.contact_id = ct.id AND m.direction = 'inbound') AS total_inbound_msgs,
  (SELECT COUNT(*) FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE c.contact_id = ct.id AND m.direction = 'outbound') AS total_outbound_msgs
FROM contacts ct
LEFT JOIN brokers b ON b.id = ct.assigned_broker_id
WHERE ct.dnc = true;

CREATE OR REPLACE VIEW v_dnc_metrics AS
SELECT
  ct.tenant_id,
  ct.dnc_reason,
  COALESCE(
    (SELECT c.source FROM conversations c WHERE c.contact_id = ct.id ORDER BY c.last_message_at DESC NULLS LAST LIMIT 1),
    'unknown'
  ) AS origin_source,
  DATE_TRUNC('day', ct.dnc_at)::date AS day,
  COUNT(*) AS n_contacts
FROM contacts ct
WHERE ct.dnc = true AND ct.dnc_at IS NOT NULL
GROUP BY 1, 2, 3, 4;

CREATE OR REPLACE VIEW v_dnc_rate_by_source AS
WITH totals AS (
  SELECT
    c.tenant_id,
    c.source,
    COUNT(DISTINCT c.contact_id) AS total_contacts,
    COUNT(DISTINCT c.contact_id) FILTER (WHERE ct.dnc = true) AS dnc_contacts,
    COUNT(DISTINCT c.contact_id) FILTER (WHERE ct.dnc = true AND ct.dnc_reason = 'opt_out') AS opt_out_contacts,
    COUNT(DISTINCT c.contact_id) FILTER (WHERE ct.dnc = true AND ct.dnc_reason = 'auto_reply') AS auto_reply_contacts,
    COUNT(DISTINCT c.contact_id) FILTER (WHERE ct.dnc = true AND ct.dnc_reason = 'wrong_audience') AS wrong_audience_contacts
  FROM conversations c
  JOIN contacts ct ON ct.id = c.contact_id
  WHERE c.source IS NOT NULL
  GROUP BY c.tenant_id, c.source
)
SELECT
  tenant_id,
  source,
  total_contacts,
  dnc_contacts,
  opt_out_contacts,
  auto_reply_contacts,
  wrong_audience_contacts,
  ROUND((dnc_contacts::numeric / NULLIF(total_contacts, 0)) * 100, 2) AS dnc_rate_pct,
  ROUND((opt_out_contacts::numeric / NULLIF(total_contacts, 0)) * 100, 2) AS opt_out_rate_pct
FROM totals;
