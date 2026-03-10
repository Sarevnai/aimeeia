-- Ensure pg_net is available to make HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- This function will be triggered by pg_cron
-- It will make a POST request to our Edge Function for each active tenant with a CRM
CREATE OR REPLACE FUNCTION public.trigger_crm_sync_for_all_tenants() 
RETURNS void AS $$
DECLARE
    tenant_record RECORD;
    edge_function_url TEXT;
    anon_key TEXT;
BEGIN
    -- We need to know the URL of the Edge Function to call.
    -- Assuming a common environment variable or relying on the project URL setup.
    -- In a real scenario, this would be the specific URL of the deployed function.
    -- For Supabase platform, we can use the project URL.

    -- Note: Hardcoding the project URL in a migration is tricky because it varies per environment.
    -- A better approach might be to store the Base URL in a configurable table mapping or Vault.
    
    -- For the sake of this setup, we'll demonstrate the structure.
    -- To truly work in production, this script would ideally pull secrets or environment vars.
    -- We use net.http_post to trigger our Serverless function
    
    FOR tenant_record IN 
        SELECT id FROM public.tenants 
        WHERE is_active = true 
        AND crm_type = 'vista' 
        AND crm_api_key IS NOT NULL 
        AND crm_api_url IS NOT NULL
    LOOP
        -- Replace with your actual deployed Edge Function URL and Service Role Key
        -- Since this is executed purely inside Postgres, it needs knowledge of those secrets
        -- For a development/local setup, we often use the host.docker.internal path
        -- Or we can skip pg_cron HTTP calling here and rely on a simple external CI/CD ping, 
        -- but this is the native way to do it via pg_cron.

        PERFORM net.http_post(
            url := 'https://' || current_setting('request.headers')::json->>'host' || '/functions/v1/crm-sync-properties',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                -- Provide the Service Role Key here to bypass anon limits if necessary
                'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY' 
            ),
            body := jsonb_build_object('tenant_id', tenant_record.id)
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule the sync every 15 minutes
SELECT cron.schedule(
    'daily-crm-sync',
    '*/15 * * * *',
    $$SELECT public.trigger_crm_sync_for_all_tenants()$$
);
