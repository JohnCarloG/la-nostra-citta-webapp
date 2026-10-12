-- Migrazione: 20261006000002_additional_constraints
-- Vincoli SQL aggiuntivi richiesti dal Modello Logico

-- 1. CHECK numerici
ALTER TABLE "Segnalazione" 
ADD CONSTRAINT chk_segnalazione_coords 
CHECK (latitudine BETWEEN -90 AND 90 AND longitudine BETWEEN -180 AND 180);

ALTER TABLE "Media" 
ADD CONSTRAINT chk_media_bytesize 
CHECK (byte_size > 0);

ALTER TABLE "AnalisiIa" 
ADD CONSTRAINT chk_analisi_revisione 
CHECK (revisione > 0);

ALTER TABLE "AnalisiIa" 
ADD CONSTRAINT chk_analisi_punteggio 
CHECK (punteggio IS NULL OR (punteggio >= 0 AND punteggio <= 1));

-- 2. Coerenza dell'attore Audit
ALTER TABLE "AuditEvento"
ADD CONSTRAINT chk_audit_attore
CHECK (
  (tipo_attore = 'UTENTE' AND attore_id IS NOT NULL) OR
  (tipo_attore = 'SISTEMA' AND attore_id IS NULL)
);

-- 3. Vincolo coerenza Media/Analisi: se AnalisiIa punta a un Media, quel Media deve appartenere alla stessa Segnalazione
CREATE OR REPLACE FUNCTION check_analisi_media_coerenza()
RETURNS TRIGGER AS $$
DECLARE
  media_seg_id UUID;
BEGIN
  IF NEW.media_id IS NOT NULL THEN
    SELECT segnalazione_id INTO media_seg_id FROM "Media" WHERE id = NEW.media_id;
    IF media_seg_id != NEW.segnalazione_id THEN
      RAISE EXCEPTION 'Incoerenza: Il Media analizzato non appartiene alla stessa Segnalazione dell''Analisi.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_analisi_media
BEFORE INSERT OR UPDATE ON "AnalisiIa"
FOR EACH ROW
EXECUTE FUNCTION check_analisi_media_coerenza();
