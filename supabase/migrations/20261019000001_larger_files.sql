-- Fichiers jusqu'à 50 Mo (plafond de l'offre gratuite de Supabase Cloud).
-- Les gros PDF sont envoyés à Gemini par lots redivisés automatiquement (voir pdfBatches).
update storage.buckets set file_size_limit = 50 * 1024 * 1024 where id = 'documents';
