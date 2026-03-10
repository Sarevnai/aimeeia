-- Fix: replace dynamic URL construction (current_setting throws in pg_cron context)
-- with hardcoded Supabase project URL.
CREATE OR REPLACE FUNCTION public.trigger_crm_sync_for_all_tenants()
RETURNS void AS $$
DECLARE
    tenant_record RECORD;
BEGIN
    FOR tenant_record IN
        SELECT id FROM public.tenants
        WHERE is_active = true
          AND crm_type = 'vista'
          AND crm_api_key IS NOT NULL
          AND crm_api_url IS NOT NULL
    LOOP
        PERFORM net.http_post(
            url := 'https://vnysbpnggnplvgkfokin.supabase.co/functions/v1/crm-sync-properties',
            headers := jsonb_build_object('Content-Type', 'application/json'),
            body := jsonb_build_object('tenant_id', tenant_record.id)
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
