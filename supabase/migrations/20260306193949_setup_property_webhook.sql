-- Ensure pg_net is available for webhooks
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function that will be called by our trigger to send the payload to the Edge Function
CREATE OR REPLACE FUNCTION public.invoke_generate_property_embedding()
RETURNS TRIGGER AS $$
DECLARE
  edge_function_url TEXT;
BEGIN
  -- We assume the edge function is hosted on the same Supabase project.
  -- You must change this domain based on your environment.
  -- In local development with Supabase CLI, this might need to point to your local machine IP / Docker host
  -- In production, it will be something like https://[PROJECT_REF].functions.supabase.co/generate-property-embedding
  -- For this example, we'll construct it dynamically from the request headers if possible, or use a hardcoded value.
  
  -- The most reliable way in Supabase is using the project's functions URL.
  -- Since we cannot easily know if we are local or remote in pure SQL cross-compatibility,
  -- we expect that the user might need to define an ENV variable for the base URL,
  -- but we can use the default pattern or `net.http_post` targeting the cloud URL.
  
  -- WE MUST REPLACE 'https://[YOUR_PROJECT_REF].functions.supabase.co/generate-property-embedding'
  -- OR rely on API gateway forwarding if local.
  -- Note: using net.http_post directly inside the DB requires providing the Service Role API Key 
  -- if the function requries authorization, but for webhook receivers we usually pass a secret or rely on JWT.

  -- Using a safer async webhooks mechanism if available, or just straight pg_net
  PERFORM net.http_post(
      url := 'https://' || current_setting('request.headers', true)::json->>'host' || '/functions/v1/generate-property-embedding',
      headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY' 
      ),
      -- Supabase Webhook style payload
      body := jsonb_build_object(
        'type', TG_OP,
        'table', TG_TABLE_NAME,
        'record', row_to_json(NEW),
        'old_record', row_to_json(OLD)
      )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop the trigger if it already exists
DROP TRIGGER IF EXISTS property_embedding_trigger ON public.properties;

-- Create the trigger
-- We want this to fire when a new property is inserted, 
-- or when critical semantic fields are updated.
-- We do NOT want to fire it when the `embedding` itself changes, because that would create an infinite loop.
CREATE TRIGGER property_embedding_trigger
AFTER INSERT OR UPDATE OF city, neighborhood, price, bedrooms, parking_spaces, description, title
ON public.properties
FOR EACH ROW
-- Prevent infinite loop by ensuring we aren't firing on our own embedding updates
WHEN (pg_trigger_depth() = 0)
EXECUTE FUNCTION public.invoke_generate_property_embedding();
