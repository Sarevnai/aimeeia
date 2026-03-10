-- Fix: replace dynamic URL (current_setting returns NULL outside HTTP context → 'https://null/...')
-- with hardcoded Supabase project URL. verify_jwt=false so no Authorization header needed.
CREATE OR REPLACE FUNCTION public.invoke_generate_property_embedding()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM net.http_post(
        url := 'https://vnysbpnggnplvgkfokin.supabase.co/functions/v1/generate-property-embedding',
        headers := jsonb_build_object('Content-Type', 'application/json'),
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
