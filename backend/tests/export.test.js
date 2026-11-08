import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import ExcelJS from 'exceljs';
import { getDb } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { findOrCreateCustomer } from '../src/db/customersRepo.js';
import { createOrder } from '../src/db/ordersRepo.js';
import { buildExportRows, buildXlsxBuffer, buildCsv, COLUMNS, saveXlsxExport } from '../src/services/export.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'boudins-export-test-'));
}

function seedOneOrder(db) {
  const customerId = findOrCreateCustomer(db, { first_name: 'Jeanne', last_name: 'Dupont', phone: '0612345678' });
  createOrder(db, {
    customerId,
    season: '2026',
    lines: [{ product_id: 'blanc', quantity_500g: 2, unit_price_cents: 500, line_total_cents: 1000 }],
    totalCents: 1000,
  });
}

describe('services/export', () => {
  let db;

  afterEach(() => {
    db?.close();
  });

  it('buildExportRows produit une ligne par produit commandé avec les bonnes conversions', () => {
    db = getDb(':memory:');
    migrate(db);
    seed(db);
    seedOneOrder(db);

    const rows = buildExportRows(db, '2026');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      first_name: 'Jeanne',
      last_name: 'Dupont',
      phone: '0612345678',
      product_name: 'Boudin blanc',
      quantity_500g: 2,
      quantity_g: 1000,
      line_total_euros: 10,
      status: 'recue',
    });
  });

  it('buildExportRows ne renvoie rien pour une saison sans commande', () => {
    db = getDb(':memory:');
    migrate(db);
    seed(db);
    seedOneOrder(db);

    expect(buildExportRows(db, '2099')).toHaveLength(0);
  });

  it('buildCsv commence par un BOM UTF-8 et utilise `;` comme séparateur', () => {
    db = getDb(':memory:');
    migrate(db);
    seed(db);
    seedOneOrder(db);

    const csv = buildCsv(buildExportRows(db, '2026'));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trim().split('\n');
    expect(lines[0].split(';')).toHaveLength(COLUMNS.length);
    expect(lines[1]).toContain('Dupont');
    expect(lines[1]).toContain('Jeanne');
  });

  it('buildCsv échappe les valeurs contenant `;` ou des guillemets', () => {
    const csv = buildCsv([{ created_at: 'x', first_name: 'Jean;Pierre', last_name: 'D"upont', phone: '', product_name: '', quantity_500g: 0, quantity_g: 0, line_total_euros: 0, status: '' }]);
    expect(csv).toContain('"Jean;Pierre"');
    expect(csv).toContain('"D""upont"');
  });

  it('buildXlsxBuffer génère un classeur lisible avec les en-têtes et les lignes attendues', async () => {
    db = getDb(':memory:');
    migrate(db);
    seed(db);
    seedOneOrder(db);

    const buffer = await buildXlsxBuffer(buildExportRows(db, '2026'));
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Commandes');

    const headerRow = sheet.getRow(1).values.filter(Boolean);
    expect(headerRow).toEqual(COLUMNS.map((c) => c.header));

    const dataRow = sheet.getRow(2).values;
    expect(dataRow).toContain('Dupont');
    expect(dataRow).toContain('Boudin blanc');
  });
});

describe('services/export saveXlsxExport', () => {
  let db;
  let tmpDir;

  afterEach(() => {
    db?.close();
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('écrit un fichier xlsx lisible avec les lignes attendues', async () => {
    db = getDb(':memory:');
    migrate(db);
    seed(db);
    seedOneOrder(db);
    tmpDir = makeTempDir();
    const exportsDir = path.join(tmpDir, 'exports');

    const savedPath = await saveXlsxExport(db, '2026', { exportsDir });

    const destPath = path.join(exportsDir, 'commandes-2026.xlsx');
    expect(fs.existsSync(destPath)).toBe(true);
    const backendRoot = path.join(__dirname, '..');
    expect(path.resolve(backendRoot, savedPath)).toBe(destPath);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fs.readFileSync(destPath));
    const sheet = workbook.getWorksheet('Commandes');
    expect(sheet.getRow(2).values).toContain('Dupont');
  });

  it('un deuxième export sur la même saison écrase le fichier existant (pas d\'accumulation)', async () => {
    db = getDb(':memory:');
    migrate(db);
    seed(db);
    seedOneOrder(db);
    tmpDir = makeTempDir();
    const exportsDir = path.join(tmpDir, 'exports');

    await saveXlsxExport(db, '2026', { exportsDir });
    const secondCustomerId = findOrCreateCustomer(db, { first_name: 'Paul', last_name: 'Martin', phone: '0698765432' });
    createOrder(db, {
      customerId: secondCustomerId,
      season: '2026',
      lines: [{ product_id: 'blanc', quantity_500g: 1, unit_price_cents: 500, line_total_cents: 500 }],
      totalCents: 500,
    });
    await saveXlsxExport(db, '2026', { exportsDir });

    const files = fs.readdirSync(exportsDir);
    expect(files).toEqual(['commandes-2026.xlsx']);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fs.readFileSync(path.join(exportsDir, 'commandes-2026.xlsx')));
    const sheet = workbook.getWorksheet('Commandes');
    expect(sheet.rowCount).toBe(3); // en-tête + 2 commandes
  });
});
