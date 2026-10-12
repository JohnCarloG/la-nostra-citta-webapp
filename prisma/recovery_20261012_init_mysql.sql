-- ==============================================================================
-- SCRIPT DI RECUPERO CONTROLLATO DDL PER 'la_nostra_citta_test'
-- Stato iniziale rilevato:
-- 1. EventoStato non ha alcuna FK attiva (EventoStato_segnalazione_id_fkey era caduta)
-- 2. AuditEvento_attore_id_fkey e AuditEvento_segnalazione_id_fkey sono presenti con ON UPDATE CASCADE
-- 3. AnalisiIa_media_id_segnalazione_id_fkey e AnalisiIa_segnalazione_id_fkey sono presenti con ON UPDATE CASCADE
-- 4. chk_audit_attore e chk_evento_attore non sono ancora applicati
-- Obiettivo:
-- - Allineare a ON UPDATE RESTRICT e applicare i CHECK senza toccare dati né altre tabelle
-- ==============================================================================

-- 1. FK EventoStato (creazione con ON DELETE RESTRICT ON UPDATE RESTRICT)
ALTER TABLE `EventoStato` ADD CONSTRAINT `EventoStato_segnalazione_id_fkey` FOREIGN KEY (`segnalazione_id`) REFERENCES `Segnalazione`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `EventoStato` ADD CONSTRAINT `EventoStato_attore_id_fkey` FOREIGN KEY (`attore_id`) REFERENCES `Utente`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- 2. FK AuditEvento (aggiornamento a ON DELETE RESTRICT ON UPDATE RESTRICT)
ALTER TABLE `AuditEvento` DROP FOREIGN KEY `AuditEvento_attore_id_fkey`;
ALTER TABLE `AuditEvento` DROP FOREIGN KEY `AuditEvento_segnalazione_id_fkey`;
ALTER TABLE `AuditEvento` ADD CONSTRAINT `AuditEvento_attore_id_fkey` FOREIGN KEY (`attore_id`) REFERENCES `Utente`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `AuditEvento` ADD CONSTRAINT `AuditEvento_segnalazione_id_fkey` FOREIGN KEY (`segnalazione_id`) REFERENCES `Segnalazione`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- 3. FK AnalisiIa (aggiornamento a ON DELETE RESTRICT ON UPDATE RESTRICT)
ALTER TABLE `AnalisiIa` DROP FOREIGN KEY `AnalisiIa_segnalazione_id_fkey`;
ALTER TABLE `AnalisiIa` DROP FOREIGN KEY `AnalisiIa_media_id_segnalazione_id_fkey`;
ALTER TABLE `AnalisiIa` ADD CONSTRAINT `AnalisiIa_segnalazione_id_fkey` FOREIGN KEY (`segnalazione_id`) REFERENCES `Segnalazione`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE `AnalisiIa` ADD CONSTRAINT `AnalisiIa_media_id_segnalazione_id_fkey` FOREIGN KEY (`media_id`, `segnalazione_id`) REFERENCES `Media`(`id`, `segnalazione_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- 4. Applicazione dei vincoli CHECK mancanti
ALTER TABLE `AuditEvento` ADD CONSTRAINT `chk_audit_attore` CHECK ((`tipo_attore` = 'UTENTE' AND `attore_id` IS NOT NULL) OR (`tipo_attore` = 'SISTEMA' AND `attore_id` IS NULL));
ALTER TABLE `EventoStato` ADD CONSTRAINT `chk_evento_attore` CHECK ((`tipo_attore` = 'UTENTE' AND `attore_id` IS NOT NULL) OR (`tipo_attore` = 'SISTEMA' AND `attore_id` IS NULL));
