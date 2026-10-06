-- CreateEnum
CREATE TYPE "RuoloUtente" AS ENUM ('CITTADINO', 'COMITATO');

-- CreateEnum
CREATE TYPE "StatoAccount" AS ENUM ('ATTIVO', 'SOSPESO');

-- CreateEnum
CREATE TYPE "StatoAvanzamento" AS ENUM ('RICEVUTA', 'PRESA_IN_CARICO', 'INVIATA_AI_CANDIDATI', 'RITIRATA');

-- CreateEnum
CREATE TYPE "StatoModerazione" AS ENUM ('PENDENTE', 'IN_REVISIONE', 'APPROVATA', 'RIFIUTATA');

-- CreateEnum
CREATE TYPE "OriginePosizione" AS ENUM ('MANUALE', 'EXIF_CONFERMATO');

-- CreateEnum
CREATE TYPE "TipoMedia" AS ENUM ('FOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "StatoFile" AS ENUM ('READY', 'QUARANTENA', 'ERRORE');

-- CreateEnum
CREATE TYPE "TipoAttore" AS ENUM ('UTENTE', 'SISTEMA');

-- CreateEnum
CREATE TYPE "AmbitoEvento" AS ENUM ('AVANZAMENTO', 'MODERAZIONE');

-- CreateEnum
CREATE TYPE "ModuloIA" AS ENUM ('MODERAZIONE', 'CLASSIFICAZIONE', 'EXIF', 'COERENZA');

-- CreateEnum
CREATE TYPE "StatoEsecuzione" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "StatoUpload" AS ENUM ('IN_CARICAMENTO', 'VALIDO', 'SCARTATO', 'CONSUMATO');

-- CreateEnum
CREATE TYPE "TipoToken" AS ENUM ('VERIFICA_EMAIL', 'RESET_PASSWORD');

-- CreateTable
CREATE TABLE "Quartiere" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,

    CONSTRAINT "Quartiere_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Utente" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "email_normalizzata" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "verificato_il" TIMESTAMP(3),
    "ruolo" "RuoloUtente" NOT NULL DEFAULT 'CITTADINO',
    "stato_account" "StatoAccount" NOT NULL DEFAULT 'ATTIVO',
    "quartiere_id" UUID,
    "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Utente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segnalazione" (
    "id" UUID NOT NULL,
    "autore_id" UUID NOT NULL,
    "descrizione" TEXT NOT NULL,
    "latitudine" DOUBLE PRECISION NOT NULL,
    "longitudine" DOUBLE PRECISION NOT NULL,
    "origine_posizione" "OriginePosizione" NOT NULL,
    "stato_avanzamento" "StatoAvanzamento" NOT NULL DEFAULT 'RICEVUTA',
    "stato_moderazione" "StatoModerazione" NOT NULL DEFAULT 'PENDENTE',
    "revisione" INTEGER NOT NULL DEFAULT 1,
    "creata_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aggiornata_il" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Segnalazione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" UUID NOT NULL,
    "segnalazione_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "tipo" "TipoMedia" NOT NULL,
    "mime" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "durata_secondi" INTEGER,
    "sha256" TEXT NOT NULL,
    "stato_file" "StatoFile" NOT NULL DEFAULT 'READY',
    "exif_lat" DOUBLE PRECISION,
    "exif_lon" DOUBLE PRECISION,
    "derivato_key" TEXT,
    "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sostegno" (
    "utente_id" UUID NOT NULL,
    "segnalazione_id" UUID NOT NULL,
    "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sostegno_pkey" PRIMARY KEY ("utente_id","segnalazione_id")
);

-- CreateTable
CREATE TABLE "Categoria" (
    "id" UUID NOT NULL,
    "codice" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "attiva" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Categoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegnalazioneCategoria" (
    "segnalazione_id" UUID NOT NULL,
    "categoria_id" UUID NOT NULL,

    CONSTRAINT "SegnalazioneCategoria_pkey" PRIMARY KEY ("segnalazione_id","categoria_id")
);

-- CreateTable
CREATE TABLE "EventoStato" (
    "id" UUID NOT NULL,
    "segnalazione_id" UUID NOT NULL,
    "attore_id" UUID,
    "tipo_attore" "TipoAttore" NOT NULL,
    "ambito" "AmbitoEvento" NOT NULL,
    "da_stato" TEXT,
    "a_stato" TEXT NOT NULL,
    "motivazione" TEXT NOT NULL,
    "revisione" INTEGER NOT NULL,
    "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventoStato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvento" (
    "id" UUID NOT NULL,
    "attore_id" UUID,
    "tipo_attore" "TipoAttore" NOT NULL,
    "segnalazione_id" UUID,
    "azione" TEXT NOT NULL,
    "request_id" TEXT,
    "dati_json" TEXT,
    "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalisiIa" (
    "id" UUID NOT NULL,
    "segnalazione_id" UUID NOT NULL,
    "media_id" UUID,
    "revisione" INTEGER NOT NULL,
    "modulo" "ModuloIA" NOT NULL,
    "versione_modello" TEXT NOT NULL,
    "versione_policy" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "stato_esecuzione" "StatoEsecuzione" NOT NULL DEFAULT 'QUEUED',
    "esito" TEXT,
    "punteggio" DOUBLE PRECISION,
    "dettagli_json" TEXT,
    "tentativi" INTEGER NOT NULL DEFAULT 0,
    "creata_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completata_il" TIMESTAMP(3),

    CONSTRAINT "AnalisiIa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuggerimentoCategoria" (
    "analisi_id" UUID NOT NULL,
    "categoria_id" UUID NOT NULL,
    "confidenza" DOUBLE PRECISION,

    CONSTRAINT "SuggerimentoCategoria_pkey" PRIMARY KEY ("analisi_id","categoria_id")
);

-- CreateTable
CREATE TABLE "UploadTemporaneo" (
    "id" UUID NOT NULL,
    "proprietario_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "tipo" "TipoMedia" NOT NULL,
    "mime" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "durata_secondi" INTEGER,
    "exif_lat" DOUBLE PRECISION,
    "exif_lon" DOUBLE PRECISION,
    "stato" "StatoUpload" NOT NULL DEFAULT 'IN_CARICAMENTO',
    "scade_il" TIMESTAMP(3) NOT NULL,
    "consumato_il" TIMESTAMP(3),

    CONSTRAINT "UploadTemporaneo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenAccount" (
    "id" UUID NOT NULL,
    "utente_id" UUID NOT NULL,
    "tipo" "TipoToken" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "scade_il" TIMESTAMP(3) NOT NULL,
    "usato_il" TIMESTAMP(3),
    "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sessione" (
    "id" UUID NOT NULL,
    "utente_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "scade_il" TIMESTAMP(3) NOT NULL,
    "revocata_il" TIMESTAMP(3),
    "creato_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sessione_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outbox" (
    "id" UUID NOT NULL,
    "segnalazione_id" UUID NOT NULL,
    "revisione" INTEGER NOT NULL,
    "tipo_evento" TEXT NOT NULL,
    "payload_json" TEXT NOT NULL,
    "creata_il" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "elaborata_il" TIMESTAMP(3),
    "tentativi" INTEGER NOT NULL DEFAULT 0,
    "prossimo_tentativo_il" TIMESTAMP(3),

    CONSTRAINT "Outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RichiestaIdempotente" (
    "utente_id" UUID NOT NULL,
    "chiave" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "segnalazione_id" UUID,
    "stato" TEXT NOT NULL,
    "scade_il" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RichiestaIdempotente_pkey" PRIMARY KEY ("utente_id","chiave")
);

-- CreateIndex
CREATE UNIQUE INDEX "Quartiere_nome_key" ON "Quartiere"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Utente_email_normalizzata_key" ON "Utente"("email_normalizzata");

-- CreateIndex
CREATE INDEX "Segnalazione_stato_moderazione_stato_avanzamento_creata_il__idx" ON "Segnalazione"("stato_moderazione", "stato_avanzamento", "creata_il", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Media_storage_key_key" ON "Media"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "Media_derivato_key_key" ON "Media"("derivato_key");

-- CreateIndex
CREATE INDEX "Sostegno_segnalazione_id_idx" ON "Sostegno"("segnalazione_id");

-- CreateIndex
CREATE UNIQUE INDEX "Categoria_codice_key" ON "Categoria"("codice");

-- CreateIndex
CREATE INDEX "EventoStato_segnalazione_id_creato_il_id_idx" ON "EventoStato"("segnalazione_id", "creato_il", "id");

-- CreateIndex
CREATE INDEX "AnalisiIa_stato_esecuzione_creata_il_idx" ON "AnalisiIa"("stato_esecuzione", "creata_il");

-- CreateIndex
CREATE UNIQUE INDEX "AnalisiIa_segnalazione_id_revisione_modulo_input_hash_versi_key" ON "AnalisiIa"("segnalazione_id", "revisione", "modulo", "input_hash", "versione_modello", "versione_policy");

-- CreateIndex
CREATE UNIQUE INDEX "UploadTemporaneo_storage_key_key" ON "UploadTemporaneo"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "TokenAccount_token_hash_key" ON "TokenAccount"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "Sessione_token_hash_key" ON "Sessione"("token_hash");

-- CreateIndex
CREATE INDEX "Outbox_elaborata_il_prossimo_tentativo_il_idx" ON "Outbox"("elaborata_il", "prossimo_tentativo_il");

-- CreateIndex
CREATE UNIQUE INDEX "Outbox_segnalazione_id_revisione_tipo_evento_key" ON "Outbox"("segnalazione_id", "revisione", "tipo_evento");

-- AddForeignKey
ALTER TABLE "Utente" ADD CONSTRAINT "Utente_quartiere_id_fkey" FOREIGN KEY ("quartiere_id") REFERENCES "Quartiere"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segnalazione" ADD CONSTRAINT "Segnalazione_autore_id_fkey" FOREIGN KEY ("autore_id") REFERENCES "Utente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_segnalazione_id_fkey" FOREIGN KEY ("segnalazione_id") REFERENCES "Segnalazione"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sostegno" ADD CONSTRAINT "Sostegno_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "Utente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sostegno" ADD CONSTRAINT "Sostegno_segnalazione_id_fkey" FOREIGN KEY ("segnalazione_id") REFERENCES "Segnalazione"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegnalazioneCategoria" ADD CONSTRAINT "SegnalazioneCategoria_segnalazione_id_fkey" FOREIGN KEY ("segnalazione_id") REFERENCES "Segnalazione"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegnalazioneCategoria" ADD CONSTRAINT "SegnalazioneCategoria_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoStato" ADD CONSTRAINT "EventoStato_segnalazione_id_fkey" FOREIGN KEY ("segnalazione_id") REFERENCES "Segnalazione"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoStato" ADD CONSTRAINT "EventoStato_attore_id_fkey" FOREIGN KEY ("attore_id") REFERENCES "Utente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvento" ADD CONSTRAINT "AuditEvento_attore_id_fkey" FOREIGN KEY ("attore_id") REFERENCES "Utente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvento" ADD CONSTRAINT "AuditEvento_segnalazione_id_fkey" FOREIGN KEY ("segnalazione_id") REFERENCES "Segnalazione"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalisiIa" ADD CONSTRAINT "AnalisiIa_segnalazione_id_fkey" FOREIGN KEY ("segnalazione_id") REFERENCES "Segnalazione"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalisiIa" ADD CONSTRAINT "AnalisiIa_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "Media"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggerimentoCategoria" ADD CONSTRAINT "SuggerimentoCategoria_analisi_id_fkey" FOREIGN KEY ("analisi_id") REFERENCES "AnalisiIa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SuggerimentoCategoria" ADD CONSTRAINT "SuggerimentoCategoria_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "Categoria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadTemporaneo" ADD CONSTRAINT "UploadTemporaneo_proprietario_id_fkey" FOREIGN KEY ("proprietario_id") REFERENCES "Utente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenAccount" ADD CONSTRAINT "TokenAccount_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "Utente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sessione" ADD CONSTRAINT "Sessione_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "Utente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outbox" ADD CONSTRAINT "Outbox_segnalazione_id_fkey" FOREIGN KEY ("segnalazione_id") REFERENCES "Segnalazione"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RichiestaIdempotente" ADD CONSTRAINT "RichiestaIdempotente_utente_id_fkey" FOREIGN KEY ("utente_id") REFERENCES "Utente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RichiestaIdempotente" ADD CONSTRAINT "RichiestaIdempotente_segnalazione_id_fkey" FOREIGN KEY ("segnalazione_id") REFERENCES "Segnalazione"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Questa migrazione aggiunge i vincoli CHECK e i trigger di consistenza
-- che Prisma non esprime nativamente nello schema.

-- 1. Vincolo: Una segnalazione deve avere almeno un media valido READY
-- Il trigger viene eseguito sulle operazioni relative alla tabella Media 
-- ma verificato al termine della transazione per supportare inserimenti contestuali.
CREATE OR REPLACE FUNCTION check_media_min_cardinality()
RETURNS TRIGGER AS $$
DECLARE
  media_count INT;
  target_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_id := OLD.segnalazione_id;
  ELSE
    target_id := NEW.segnalazione_id;
  END IF;
  
  SELECT COUNT(*) INTO media_count FROM "Media" WHERE segnalazione_id = target_id AND stato_file = 'READY';
  IF media_count = 0 THEN
    RAISE EXCEPTION 'Una segnalazione deve avere almeno un media READY.';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_check_media_cardinality_media
AFTER INSERT OR UPDATE OR DELETE ON "Media"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_media_min_cardinality();

-- 2. Vincolo: L'autore di un sostegno non puÃ² essere l'autore della segnalazione (Divieto di autosostegno)
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

-- 4. Vincolo CHECK su Media: lat e lon EXIF devono essere entrambi presenti o entrambi nulli
ALTER TABLE "Media"
ADD CONSTRAINT chk_exif_coords
CHECK (
  (exif_lat IS NULL AND exif_lon IS NULL) OR
  (exif_lat IS NOT NULL AND exif_lon IS NOT NULL)
);
