-- AlterTable Quartiere
ALTER TABLE `Quartiere` ADD COLUMN `codice` VARCHAR(50) NULL;
ALTER TABLE `Quartiere` ADD COLUMN `is_ufficiale` BOOLEAN NOT NULL DEFAULT TRUE;

-- CreateIndex
CREATE UNIQUE INDEX `Quartiere_codice_key` ON `Quartiere`(`codice`);
