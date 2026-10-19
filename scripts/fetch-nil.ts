import fs from 'fs';
import path from 'path';

async function main() {
  const urlCsv = 'https://dati.comune.milano.it/dataset/e8e765fc-d882-40b8-95d8-16ff3d39eb7c/resource/3fce7202-0076-4a7b-ac2c-d2ab9b5dc658/download/ds964_nil_wm_4326.csv';
  const urlGeoJson = 'https://dati.comune.milano.it/dataset/e8e765fc-d882-40b8-95d8-16ff3d39eb7c/resource/9c4e0776-56fc-4f3d-8a90-f4992a3be426/download/ds964_nil_wm.geojson';

  console.log('Downloading CSV from Comune di Milano...');
  try {
    const res = await fetch(urlCsv);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const text = await res.text();
    const dest = path.resolve(process.cwd(), 'docs', 'nil_milano_pgt2030.csv');
    fs.writeFileSync(dest, text, 'utf8');
    console.log(`Saved CSV to ${dest} (${text.length} bytes)`);

    const lines = text.trim().split(/\r?\n/);
    console.log(`Total lines: ${lines.length}`);
    console.log(`Header: ${lines[0]}`);
    console.log(`Sample row 1: ${lines[1]}`);
    console.log(`Sample row 2: ${lines[2]}`);
  } catch (err) {
    console.error('Error fetching CSV:', err);
  }
}

main();
