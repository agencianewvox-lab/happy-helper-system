CREATE POLICY "Masters can delete grupos"
ON public.whatsapp_grupos
FOR DELETE
TO authenticated
USING (EXISTS (
  SELECT 1 FROM profiles
  WHERE profiles.user_id = auth.uid() AND profiles.is_master = true
));