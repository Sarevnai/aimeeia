-- Cron job to send follow-up messages when a lead hasn't responded after being shown a property.
-- Runs every minute. Resets last_property_shown_at before calling the Edge Function
-- to prevent duplicate sends even if the HTTP call is slow.

CREATE OR REPLACE FUNCTION public.trigger_property_followups()
RETURNS void AS $$
DECLARE
  conv RECORD;
BEGIN
  FOR conv IN
    SELECT tenant_id, phone_number
    FROM conversation_states
    WHERE awaiting_property_feedback = true
      AND last_property_shown_at IS NOT NULL
      AND last_property_shown_at < NOW() - INTERVAL '3 minutes'
  LOOP
    -- Reset immediately to prevent re-triggering on the next cron tick
    UPDATE conversation_states
    SET last_property_shown_at = NULL
    WHERE tenant_id = conv.tenant_id
      AND phone_number = conv.phone_number;

    -- Call the Edge Function to send the follow-up WhatsApp message
    PERFORM net.http_post(
      url := 'https://vnysbpnggnplvgkfokin.supabase.co/functions/v1/property-followup',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'tenant_id', conv.tenant_id,
        'phone_number', conv.phone_number
      )
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule: run every minute
SELECT cron.schedule(
  'property-followup-cron',
  '* * * * *',
  'SELECT public.trigger_property_followups();'
);
