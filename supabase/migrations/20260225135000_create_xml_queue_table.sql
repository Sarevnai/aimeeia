-- Create the queue table for background XML processing
CREATE TABLE IF NOT EXISTS public.xml_sync_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    raw_data JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Basic RLS (Service role only is fine as it's modified by Edge Functions)
ALTER TABLE public.xml_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access on queue" ON public.xml_sync_queue
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Ensure pg_net is enabled
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Create the trigger function that calls the Edge Function Webhook
CREATE OR REPLACE FUNCTION public.handle_xml_queue_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  request_id bigint;
BEGIN
  -- We only want to notify if it's a new pending item
  IF NEW.status = 'pending' THEN
    SELECT net.http_post(
      url := current_setting('app.settings.edge_function_base_url', true) || '/process-xml-queue-item',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body := jsonb_build_object('record_id', NEW.id)
    ) INTO request_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Attach the trigger to the table
DROP TRIGGER IF EXISTS on_xml_sync_queue_insert ON public.xml_sync_queue;
CREATE TRIGGER on_xml_sync_queue_insert
  AFTER INSERT ON public.xml_sync_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_xml_queue_item();
