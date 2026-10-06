-- Migrazione 20261006000001_constraints
-- Contiene tutti i vincoli esecutivi SQL che integrano Prisma.

-- 1. Vincolo: Una segnalazione deve avere almeno un media valido READY
-- Funzione di verifica generica per la segnalazione (blocca la transazione in corso su record bloccati)
CREATE OR REPLACE FUNCTION check_media_min_cardinality()
RETURNS TRIGGER AS $$
DECLARE
  media_count INT;
  target_id UUID;
BEGIN
  -- Se l'evento è su Segnalazione, controlliamo la riga corrente
  IF TG_TABLE_NAME = 'Segnalazione' THEN
    target_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    target_id := OLD.segnalazione_id;
  ELSE
    target_id := NEW.segnalazione_id;
  END IF;

  -- Acquisiamo un lock esplicito sulla riga padre per prevenire race conditions
  -- di altre transazioni che potrebbero star togliendo/aggiungendo media simultaneamente.
  PERFORM 1 FROM "Segnalazione" WHERE id = target_id FOR NO KEY UPDATE;

  SELECT COUNT(*) INTO media_count FROM "Media" WHERE segnalazione_id = target_id AND stato_file = 'READY';
  IF media_count = 0 THEN
    RAISE EXCEPTION 'Una segnalazione deve avere almeno un media READY.';
  END IF;

  -- Se è un UPDATE su Media e la segnalazione è cambiata, controlliamo anche la vecchia
  IF TG_TABLE_NAME = 'Media' AND TG_OP = 'UPDATE' AND OLD.segnalazione_id != NEW.segnalazione_id THEN
    PERFORM 1 FROM "Segnalazione" WHERE id = OLD.segnalazione_id FOR NO KEY UPDATE;
    SELECT COUNT(*) INTO media_count FROM "Media" WHERE segnalazione_id = OLD.segnalazione_id AND stato_file = 'READY';
    IF media_count = 0 THEN
      RAISE EXCEPTION 'Una segnalazione deve avere almeno un media READY. Spostamento non consentito.';
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger su Segnalazione (creazione)
CREATE CONSTRAINT TRIGGER trg_check_media_cardinality_segnalazione
AFTER INSERT ON "Segnalazione"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_media_min_cardinality();

-- Trigger su Media (modifica o cancellazione)
CREATE CONSTRAINT TRIGGER trg_check_media_cardinality_media
AFTER INSERT OR UPDATE OR DELETE ON "Media"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_media_min_cardinality();

-- 2. Vincolo: L'autore di un sostegno non può essere l'autore della segnalazione
CREATE OR REPLACE FUNCTION check_no_autosostegno()
RETURNS TRIGGER AS $$
DECLARE
  autore_segnalazione UUID;
BEGIN
  SELECT autore_id INTO autore_segnalazione FROM "Segnalazione" WHERE id = NEW.segnalazione_id;
  IF autore_segnalazione = NEW.utente_id THEN
    RAISE EXCEPTION 'Autosostegno vietato.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_autosostegno
BEFORE INSERT OR UPDATE ON "Sostegno"
FOR EACH ROW
EXECUTE FUNCTION check_no_autosostegno();

-- 3. Vincolo CHECK su EventoStato: coerenza tra tipo_attore e attore_id
ALTER TABLE "EventoStato"
ADD CONSTRAINT chk_evento_attore
CHECK (
  (tipo_attore = 'UTENTE' AND attore_id IS NOT NULL) OR
  (tipo_attore = 'SISTEMA' AND attore_id IS NULL)
);

-- 4. Vincolo CHECK su Media: lat e lon EXIF devono essere entrambi presenti o nulli
ALTER TABLE "Media"
ADD CONSTRAINT chk_exif_coords
CHECK (
  (exif_lat IS NULL AND exif_lon IS NULL) OR
  (exif_lat IS NOT NULL AND exif_lon IS NOT NULL)
);
