-- Create storage bucket for development hero images
INSERT INTO storage.buckets (id, name, public)
VALUES ('development-images', 'development-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload images
CREATE POLICY "Authenticated users can upload development images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'development-images');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update development images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'development-images');

-- Allow authenticated users to delete images
CREATE POLICY "Authenticated users can delete development images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'development-images');

-- Allow public read access
CREATE POLICY "Public read access for development images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'development-images');