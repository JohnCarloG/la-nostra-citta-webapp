-- AlterTable Utente
ALTER TABLE `Utente` ADD COLUMN `codice_fiscale` VARCHAR(16) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Utente_codice_fiscale_key` ON `Utente`(`codice_fiscale`);

-- AlterTable Outbox
ALTER TABLE `Outbox` MODIFY `segnalazione_id` VARCHAR(36) NULL;
ALTER TABLE `Outbox` ALTER COLUMN `revisione` SET DEFAULT 1;

-- CreateIndex
CREATE INDEX `Outbox_tipo_evento_idx` ON `Outbox`(`tipo_evento`);
