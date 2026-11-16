import fs from 'node:fs';
const directory = 'browser-evidence';
fs.mkdirSync(directory, { recursive: true });
const observations = fs.existsSync(`${directory}/observations.json`) ? JSON.parse(fs.readFileSync(`${directory}/observations.json`, 'utf8')) : [];
const lines = [`# Browser journey: ${process.env.JOURNEY_OUTCOME ?? 'unknown'}`, `Commit: ${process.env.GITHUB_SHA ?? 'local'}`, '',
  'App e MySQL reali isolati; solo HTTP Gemini simulato nel processo worker. Qualità del modello Gemini non collaudata.', '',
  '| Azione | Atteso | Osservato | Evidenza |', '| --- | --- | --- | --- |'];
for (const r of observations) lines.push(`| ${r.action} | ${r.expected} | ${r.observed} | ${r.evidence} |`);
if (fs.existsSync(`${directory}/results.json`)) {
  const results = JSON.parse(fs.readFileSync(`${directory}/results.json`, 'utf8'));
  lines.push('', `Playwright: ${JSON.stringify(results.stats)}`);
  function inspect(suite) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) for (const result of test.results ?? []) {
      if (result.error) {
        const message = String(result.error.message ?? '').replace(/\u001b\[[0-9;]*m/g, '').slice(0, 6500);
        console.log(`::error title=Browser journey failure::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`);
        lines.push('', '```', message, '```');
      }
    }
    for (const child of suite.suites ?? []) inspect(child);
  }
  for (const suite of results.suites ?? []) inspect(suite);
}
const markdown = lines.join('\n') + '\n';
fs.writeFileSync(`${directory}/BROWSER_REPORT.md`, markdown);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
