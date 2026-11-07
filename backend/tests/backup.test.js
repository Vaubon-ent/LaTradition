import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { getDb } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { backup, purgeOldBackups } from '../scripts/backup.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'boudins-backup-test-'));
}

describe('scripts/backup', () => {
  let tmpDir;
  let dbPath;
  let destDir;

  afterEach(() => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function setup() {
    tmpDir = makeTempDir();
    dbPath = path.join(tmpDir, 'boudins.db');
    destDir = path.join(tmpDir, 'backups');
    const db = getDb(dbPath);
    migrate(db);
    seed(db);
    db.close();
  }

  it('crée une copie cohérente contenant les mêmes données', () => {
    setup();
    const destPath = backup({ db: dbPath, dest: destDir, retentionDays: 30 });

    expect(fs.existsSync(destPath)).toBe(true);
    const copy = new Database(destPath, { readonly: true });
    const products = copy.prepare('SELECT * FROM products ORDER BY id').all();
    copy.close();
    expect(products).toHaveLength(3);
    expect(products[0].id).toBe('blanc');
  });

  it("échoue clairement si le fichier source n'existe pas", () => {
    setup();
    expect(() => backup({ db: path.join(tmpDir, 'absent.db'), dest: destDir })).toThrow(/introuvable/);
  });

  it('purge les sauvegardes plus anciennes que retentionDays, garde les récentes', () => {
    setup();
    fs.mkdirSync(destDir, { recursive: true });
    const oldFile = path.join(destDir, 'boudins-old.db');
    const recentFile = path.join(destDir, 'boudins-recent.db');
    fs.writeFileSync(oldFile, 'x');
    fs.writeFileSync(recentFile, 'x');

    const now = Date.now();
    const oldTime = (now - 40 * 24 * 60 * 60 * 1000) / 1000;
    const recentTime = (now - 1 * 24 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(oldFile, oldTime, oldTime);
    fs.utimesSync(recentFile, recentTime, recentTime);

    purgeOldBackups(destDir, 30);

    expect(fs.existsSync(oldFile)).toBe(false);
    expect(fs.existsSync(recentFile)).toBe(true);
  });

  it('ignore les fichiers qui ne suivent pas le motif boudins-*.db lors de la purge', () => {
    setup();
    fs.mkdirSync(destDir, { recursive: true });
    const unrelated = path.join(destDir, 'notes.txt');
    fs.writeFileSync(unrelated, 'x');
    const veryOld = (Date.now() - 100 * 24 * 60 * 60 * 1000) / 1000;
    fs.utimesSync(unrelated, veryOld, veryOld);

    purgeOldBackups(destDir, 30);

    expect(fs.existsSync(unrelated)).toBe(true);
  });
});
