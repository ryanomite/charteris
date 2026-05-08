import Database from 'better-sqlite3';
import { config } from '../config';
import path from 'path';
import fs from 'fs';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized — call initDb() first');
  }
  return db;
}

export function initDb(): Database.Database {
  // Ensure directory exists
  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(config.dbPath);

  // Performance settings
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  createTables();
  runMigrations();
  seedIfEmpty();

  return db;
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sectionId TEXT NOT NULL REFERENCES sections(id),
      "order" INTEGER NOT NULL DEFAULT 0,
      isFixed INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_lists_section_order ON lists(sectionId, "order");

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      priority INTEGER CHECK(priority IS NULL OR (priority >= 1 AND priority <= 5)),
      dueDate TEXT,
      recurrence TEXT NOT NULL DEFAULT '',
      completed INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      master INTEGER NOT NULL DEFAULT 0,
      parentId TEXT REFERENCES tasks(id),
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived);
    CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
    CREATE INDEX IF NOT EXISTS idx_tasks_parentId ON tasks(parentId);
    CREATE INDEX IF NOT EXISTS idx_tasks_master ON tasks(master, recurrence, archived);
    CREATE INDEX IF NOT EXISTS idx_tasks_dueDate ON tasks(dueDate);

    CREATE TABLE IF NOT EXISTS subtasks (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      "order" INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_subtasks_taskId ON subtasks(taskId);

    CREATE TABLE IF NOT EXISTS labels (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS task_labels (
      taskId TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      labelId TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
      PRIMARY KEY (taskId, labelId)
    );
    CREATE INDEX IF NOT EXISTS idx_task_labels_taskId ON task_labels(taskId);
    CREATE INDEX IF NOT EXISTS idx_task_labels_labelId ON task_labels(labelId);

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      taskId TEXT NOT NULL REFERENCES tasks(id),
      listId TEXT NOT NULL REFERENCES lists(id),
      "order" INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_cards_list_order ON cards(listId, "order");
    CREATE INDEX IF NOT EXISTS idx_cards_taskId ON cards(taskId);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_task_list_unique ON cards(taskId, listId);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function runMigrations(): void {
  const cols = (db.prepare('PRAGMA table_info(lists)').all() as any[]).map((r: any) => r.name);
  if (!cols.includes('archived')) {
    db.exec('ALTER TABLE lists ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
  }

  // Expand tasks.priority constraint to allow value 5.
  const taskTableSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'tasks'")
    .get() as { sql?: string } | undefined;
  if (taskTableSql?.sql?.includes('priority <= 4')) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN TRANSACTION');
    db.exec(`
      CREATE TABLE tasks_new (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        priority INTEGER CHECK(priority IS NULL OR (priority >= 1 AND priority <= 5)),
        dueDate TEXT,
        recurrence TEXT NOT NULL DEFAULT '',
        completed INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0,
        master INTEGER NOT NULL DEFAULT 0,
        parentId TEXT REFERENCES tasks_new(id),
        createdAt TEXT NOT NULL DEFAULT (datetime('now')),
        updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`
      INSERT INTO tasks_new (id, title, description, priority, dueDate, recurrence, completed, archived, master, parentId, createdAt, updatedAt)
      SELECT id, title, description, priority, dueDate, recurrence, completed, archived, master, parentId, createdAt, updatedAt
      FROM tasks
    `);
    db.exec('DROP TABLE tasks');
    db.exec('ALTER TABLE tasks_new RENAME TO tasks');
    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys = ON');

    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_archived ON tasks(archived)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_parentId ON tasks(parentId)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_master ON tasks(master, recurrence, archived)');
    db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_dueDate ON tasks(dueDate)');
  }

  // Rename sections: Planning → Briefing, Board → Cabinet
  const planningRow = db.prepare("SELECT name FROM sections WHERE slug = 'planning'").get() as any;
  if (planningRow && planningRow.name === 'Planning') {
    db.exec("UPDATE sections SET name = 'Briefing' WHERE slug = 'planning'");
  }
  const boardRow = db.prepare("SELECT name FROM sections WHERE slug = 'board'").get() as any;
  if (boardRow && boardRow.name === 'Board') {
    db.exec("UPDATE sections SET name = 'Cabinet' WHERE slug = 'board'");
  }

  // One-time label migration: rename "pm" to "home".
  // If "home" already exists, merge task links into "home" and delete "pm".
  const pmLabel = db.prepare("SELECT id FROM labels WHERE name = ? COLLATE NOCASE").get('pm') as { id: string } | undefined;
  if (pmLabel) {
    const homeLabel = db.prepare("SELECT id FROM labels WHERE name = ? COLLATE NOCASE").get('home') as { id: string } | undefined;
    const ts = now();
    if (homeLabel && homeLabel.id !== pmLabel.id) {
      db.exec('BEGIN TRANSACTION');
      try {
        db.prepare(`
          INSERT OR IGNORE INTO task_labels (taskId, labelId)
          SELECT taskId, ? FROM task_labels WHERE labelId = ?
        `).run(homeLabel.id, pmLabel.id);
        db.prepare('DELETE FROM task_labels WHERE labelId = ?').run(pmLabel.id);
        db.prepare('DELETE FROM labels WHERE id = ?').run(pmLabel.id);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    } else {
      db.prepare('UPDATE labels SET name = ?, updatedAt = ? WHERE id = ?').run('home', ts, pmLabel.id);
    }
  }

  // Remove duplicate cards in the same list for the same task, keeping most recent.
  db.exec(`
    DELETE FROM cards
    WHERE rowid IN (
      SELECT rowid FROM (
        SELECT
          rowid,
          ROW_NUMBER() OVER (
            PARTITION BY taskId, listId
            ORDER BY updatedAt DESC, createdAt DESC, id DESC
          ) AS rn
        FROM cards
      ) ranked
      WHERE ranked.rn > 1
    )
  `);

  // Enforce one card per task per list.
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_cards_task_list_unique ON cards(taskId, listId)');
}

function seedIfEmpty(): void {
  const count = db.prepare('SELECT COUNT(*) as cnt FROM sections').get() as { cnt: number };
  if (count.cnt > 0) return;

  const insertSection = db.prepare(
    'INSERT INTO sections (id, name, slug, icon, "order") VALUES (?, ?, ?, ?, ?)'
  );
  const insertList = db.prepare(
    'INSERT INTO lists (id, name, sectionId, "order", isFixed) VALUES (?, ?, ?, ?, ?)'
  );

  const txn = db.transaction(() => {
    const inboxId = generateId();
    const planningId = generateId();
    const boardId = generateId();

    insertSection.run(inboxId, 'Inbox', 'inbox', 'fa-inbox', 0);
    insertSection.run(planningId, 'Briefing', 'planning', 'fa-calendar-alt', 1);
    insertSection.run(boardId, 'Cabinet', 'board', 'fa-columns', 2);

    insertList.run(generateId(), 'Draft', inboxId, 0, 1);
    insertList.run(generateId(), 'Today', planningId, 0, 1);
    insertList.run(generateId(), 'Next', planningId, 1, 1);
  });

  txn();
  console.log('Seeded sections and fixed lists');
}

export function generateId(): string {
  // Generate a 24-char hex string
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function now(): string {
  return new Date().toISOString();
}
