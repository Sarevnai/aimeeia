-- Remove orphaned XML sync system functions (replaced by Vista CRM sync with inline embeddings)
DROP FUNCTION IF EXISTS public.notify_xml_queue_insert();
DROP FUNCTION IF EXISTS public.daily_xml_catalog_sync();
DROP FUNCTION IF EXISTS public.reprocess_pending_xml_queue(INT);
