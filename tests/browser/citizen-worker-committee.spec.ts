import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertIsolatedBrowserDatabase } from './isolated-database';

const run = promisify(execFile);
const valid = 'Segnalazione civica sintetica: rifiuti e buche sul marciapiede ostacolano il passaggio.';
const recipe = 'Ricetta sintetica: mescola farina e uova per preparare una torta.';
const ambiguous = 'Foto ambigua sintetica: segnalo rifiuti vicino al marciapiede, ma la foto non consente di confermare il luogo.';
const humanReason = 'Verifica manuale sintetica completata: il collegamento con la segnalazione è confermato.';

test('cittadino → worker reale con solo HTTP Gemini simulato → comitato → visitatore', async ({ browser }) => {
  assertIsolatedBrowserDatabase();
  const prisma = new PrismaClient();
  const contexts: BrowserContext[] = [];
  const evidence: Array<{ action: string; expected: string; observed: string; evidence: string }> = [];
  async function newPage() { const context = await browser.newContext({ baseURL: 'http://localhost:3100', viewport: { width: 1440, height: 1000 } }); contexts.push(context); return context.newPage(); }
  async function login(page: Page, email: string) {
    await page.goto('/login'); await page.locator('#login-email').fill(email); await page.locator('#login-password').fill('Browser-only-2026!');
    await page.getByRole('button', { name: 'Accedi', exact: true }).click(); await expect(page).toHaveURL(/dashboard/);
  }
  async function submit(page: Page, description: string, correctGps = false) {
    await page.goto('/dashboard'); await page.locator('#segnalazione-descrizione').fill(description);
    await page.locator('#segnalazione-files').setInputFiles('browser-evidence/synthetic-gps.jpg');
    await expect(page.getByRole('region', { name: 'Suggerimento posizione geografica dalla foto' })).toContainText('45.464200');
    await page.getByRole('button', { name: 'Usa posizione dalla foto', exact: true }).click();
    if (correctGps) {
      await page.getByRole('tab', { name: 'Alternativa testuale' }).click();
      await page.locator('#manual-lat').fill('45.4701'); await page.locator('#manual-lon').fill('9.2012');
      await page.getByRole('button', { name: 'Applica e conferma coordinate' }).click();
      await expect(page.getByText('Lat: 45.470100', { exact: false })).toBeVisible();
    }
    await page.getByRole('button', { name: 'Invia segnalazione', exact: true }).click();
    await expect(page.getByText('Segnalazione inviata con successo', { exact: true })).toBeVisible();
    const report = await prisma.segnalazione.findFirstOrThrow({ where: { descrizione: description }, include: { media: true } });
    expect(report.stato_moderazione).toBe('PENDENTE'); return report;
  }
  async function privateFromVisitor(visitor: Page, id: string, mediaId: string, description: string) {
    await visitor.goto('/segnalazioni'); await expect(visitor.locator('main')).not.toContainText(description);
    await visitor.goto('/mappa'); await expect(visitor.locator('main')).not.toContainText(description);
    await visitor.goto(`/segnalazioni/${id}`); await expect(visitor.getByText('This page could not be found.')).toBeVisible();
    expect((await visitor.context().request.get(`http://localhost:3100/api/media/${mediaId}`)).status()).toBe(404);
  }
  async function worker() {
    const result = await run(process.execPath, ['--import', path.resolve('tests/browser/gemini-http.mjs'), '--import', 'tsx', 'scripts/moderation-worker.ts', '--once'], {
      cwd: process.cwd(), timeout: 60_000, env: { ...process.env, NODE_ENV: 'test', AI_ADAPTER_MODE: 'cloud', GEMINI_MODEL: 'offline-test-model', GEMINI_API_KEY: 'offline-test-key' }
    });
    expect(result.stdout).toContain('SUCCESS');
    await fs.appendFile('browser-evidence/worker.log', result.stdout + result.stderr);
  }
  async function screenshot(page: Page, name: string) { await page.screenshot({ path: `browser-evidence/${name}.png`, fullPage: false, animations: 'disabled' }); }
  try {
    const citizen = await newPage(), visitor = await newPage(), committee = await newPage();
    await login(citizen, 'citizen@example.invalid'); await login(committee, 'committee@example.invalid');
    const first = await submit(citizen, valid, true);
    await citizen.locator('.panel.alert-success').screenshot({ path: 'browser-evidence/01-ricevuta-pendente.png' });
    await privateFromVisitor(visitor, first.id, first.media[0].id, valid);
    evidence.push({ action: 'Invio prima del worker', expected: 'PENDENTE privato per visitatore', observed: 'Ricevuta cittadino; assente da elenco e mappa; dettaglio negato e media HTTP 404', evidence: '01-ricevuta-pendente.png' });
    await worker();
    expect((await prisma.segnalazione.findUniqueOrThrow({ where: { id: first.id } })).stato_moderazione).toBe('APPROVATA');
    await visitor.goto(`/segnalazioni/${first.id}`); await expect(visitor.getByRole('heading', { level: 1 })).toContainText('Segnalazione civica sintetica');
    expect((await visitor.context().request.get(`http://localhost:3100/api/media/${first.media[0].id}`)).status()).toBe(200);
    await visitor.goto('/mappa'); await expect(visitor.locator('main')).toContainText('45.4701, 9.2012');
    await expect(visitor.locator('iframe')).toHaveAttribute('src', /marker=45\.4701%2C9\.2012/);
    await screenshot(visitor, '02-mappa-posizione-corretta');
    evidence.push({ action: 'GPS corretto e approvazione automatica', expected: 'Posizione scelta pubblica dopo APPROVATA', observed: 'Coordinate 45.4701, 9.2012 visibili e marker coerente; dettaglio e media pubblici', evidence: '02-mappa-posizione-corretta.png' });
    for (const page of [citizen, committee]) {
      await page.goto(`/segnalazioni/${first.id}`);
      const suggestions = page.getByRole('region', { name: 'Categorie suggerite dall’IA' });
      // A labelled section is exposed as a region by the real rendered page.
      await expect(suggestions).toContainText('Strade, buche e marciapiedi');
      await expect(suggestions).toContainText('Rifiuti e igiene urbana'); await expect(suggestions).toContainText('da confermare');
    }
    expect(await prisma.segnalazioneCategoria.count({ where: { segnalazione_id: first.id } })).toBe(0);
    evidence.push({ action: 'Suggerimenti IA per autore e comitato', expected: 'Due proposte distinte dalle confermate', observed: 'Entrambi vedono la sezione da confermare; zero associazioni confermate nel DB reale', evidence: 'Dettaglio autorizzato e conteggio SegnalazioneCategoria' });
    const rejected = await submit(citizen, recipe); await worker();
    expect((await prisma.segnalazione.findUniqueOrThrow({ where: { id: rejected.id } })).stato_moderazione).toBe('RIFIUTATA');
    expect(await prisma.eventoStato.count({ where: { segnalazione_id: rejected.id, tipo_attore: 'UTENTE', ambito: 'MODERAZIONE' } })).toBe(0);
    await citizen.goto('/dashboard');
    const rejectedCard = citizen.locator('.panel-subtle').filter({ hasText: recipe });
    await expect(rejectedCard).toContainText('Testo: contenuto estraneo a problemi o proposte civiche.');
    await rejectedCard.screenshot({ path: 'browser-evidence/03-rifiuto-motivato-autore.png' });
    await privateFromVisitor(visitor, rejected.id, rejected.media[0].id, recipe);
    evidence.push({ action: 'Ricetta fuori tema', expected: 'RIFIUTATA automaticamente, motivo all’autore', observed: 'Motivo fuori tema visibile in dashboard; nessuna decisione del comitato; visitatore escluso', evidence: '03-rifiuto-motivato-autore.png' });
    const review = await submit(citizen, ambiguous); await worker();
    expect((await prisma.segnalazione.findUniqueOrThrow({ where: { id: review.id } })).stato_moderazione).toBe('IN_REVISIONE');
    await privateFromVisitor(visitor, review.id, review.media[0].id, ambiguous);
    await committee.goto('/comitato');
    const reviewCard = committee.locator('.panel-subtle').filter({ has: committee.getByRole('heading', { name: ambiguous, exact: true }) });
    await expect(reviewCard).toContainText('verificare il collegamento con la descrizione');
    await reviewCard.screenshot({ path: 'browser-evidence/04-comitato-cosa-verificare.png' });
    await committee.goto(`/segnalazioni/${review.id}`);
    await committee.locator(`#mod-mot-${review.id}`).fill(humanReason);
    await committee.getByRole('button', { name: 'Approva segnalazione', exact: true }).click();
    await expect(committee.getByText('Moderazione registrata con successo:', { exact: false })).toBeVisible();
    await expect.poll(async () => (await prisma.segnalazione.findUniqueOrThrow({ where: { id: review.id } })).stato_moderazione).toBe('APPROVATA');
    for (const page of [citizen, visitor]) { await page.goto(`/segnalazioni/${review.id}`); await expect(page.getByText(humanReason, { exact: false })).toBeVisible(); }
    evidence.push({ action: 'Ambiguità e decisione motivata del comitato', expected: 'Privata in revisione; pubblica dopo decisione umana', observed: 'Coda con cosa controllare; decisione UI approva; motivazione visibile ad autore e visitatore', evidence: '04-comitato-cosa-verificare.png' });
    await citizen.goto(`/segnalazioni/${first.id}`);
    await citizen.getByText('Modifica la tua segnalazione', { exact: true }).click();
    const updated = 'Descrizione modificata sintetica: nuove buche e nuovi rifiuti da verificare.';
    await citizen.getByLabel('Nuova descrizione', { exact: true }).fill(updated);
    await citizen.getByRole('button', { name: 'Salva e richiedi nuovi controlli' }).click();
    await expect(citizen.getByRole('status')).toContainText('pubblicazione bloccata');
    await expect.poll(async () => (await prisma.segnalazione.findUniqueOrThrow({ where: { id: first.id } })).stato_moderazione).toBe('PENDENTE');
    await citizen.goto(`/segnalazioni/${first.id}`); await expect(citizen.locator('main')).toContainText('PENDENTE');
    await screenshot(citizen, '05-modifica-torna-privata');
    await privateFromVisitor(visitor, first.id, first.media[0].id, updated);
    expect((await prisma.segnalazione.findUniqueOrThrow({ where: { id: first.id } })).revisione).toBe(2);
    evidence.push({ action: 'Modifica da browser di APPROVATA', expected: 'Nuova revisione PENDENTE non pubblica prima del worker', observed: 'Revision 2; nuova descrizione privata, punto mappa rimosso, dettaglio negato e media HTTP 404', evidence: '05-modifica-torna-privata.png' });
    await worker();
    await visitor.goto(`/segnalazioni/${first.id}`); await expect(visitor.locator('main')).toContainText(updated);
    evidence.push({ action: 'Nuovo verdetto dopo modifica', expected: 'Nuova versione pubblica solo dopo nuovo esito', observed: 'Nuovo job elaborato dal worker; versione aggiornata APPROVATA e visibile al visitatore', evidence: 'DB revisione 2 + dettaglio browser' });
  } catch (error) {
    for (const [index, context] of contexts.entries()) for (const page of context.pages()) {
      await page.screenshot({ path: `browser-evidence/failure-session-${index}.png`, animations: 'disabled' }).catch(() => {});
    }
    throw error;
  } finally {
    await fs.mkdir('browser-evidence', { recursive: true });
    await fs.writeFile('browser-evidence/observations.json', JSON.stringify(evidence, null, 2));
    await Promise.all(contexts.map(c => c.close())); await prisma.$disconnect();
  }
});
