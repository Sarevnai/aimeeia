
-- Delete all records for lead 554888182882

-- 1. Messages referencing the conversation
DELETE FROM messages WHERE conversation_id = '6a1a47ce-08b0-420d-80ef-dcd7365ee207';

-- 2. Conversation events
DELETE FROM conversation_events WHERE conversation_id = '6a1a47ce-08b0-420d-80ef-dcd7365ee207';

-- 3. Conversation states
DELETE FROM conversation_states WHERE phone_number = '554888182882';

-- 4. Lead qualification
DELETE FROM lead_qualification WHERE phone_number = '554888182882';

-- 5. Tickets referencing the conversation
UPDATE tickets SET conversation_id = NULL WHERE conversation_id = '6a1a47ce-08b0-420d-80ef-dcd7365ee207';

-- 6. Conversations
DELETE FROM conversations WHERE id = '6a1a47ce-08b0-420d-80ef-dcd7365ee207';

-- 7. Portal leads log referencing the contact phone
DELETE FROM portal_leads_log WHERE contact_phone = '554888182882';

-- 8. Contact
DELETE FROM contacts WHERE phone = '554888182882';
