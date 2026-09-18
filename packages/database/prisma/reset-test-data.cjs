// Local maintenance only. Keeps identities, permissions and their company records.
const { PrismaClient } = require('../dist');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const prisma = new PrismaClient();
const preserved = new Set(['Tenant', 'CompanyBranding', 'User', 'Membership', 'EmployeeProfile']);
const execute = process.argv.includes('--execute');
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
const qualified = (name) => 'public.' + quote(name);

async function main() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.prisma'), 'utf8');
  const expected = [...schema.matchAll(/^model (\w+) \{/gm)].map((match) => match[1]).sort();
  const tables = await prisma.$queryRawUnsafe(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
  );
  const names = tables.map((row) => row.tablename).filter((name) => name !== '_prisma_migrations');
  const unknown = names.filter((name) => !expected.includes(name));
  if (unknown.length) throw new Error('Unreviewed tables: ' + unknown.join(', '));
  if (expected.some((name) => !names.includes(name))) throw new Error('Schema/table mismatch.');
  const targets = names.filter((name) => !preserved.has(name));
  const counts = {};
  for (const name of names) {
    const [row] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS count FROM ${qualified(name)}`);
    counts[name] = row.count;
  }
  console.log(JSON.stringify({ mode: execute ? 'execute' : 'preview', preserved: Object.fromEntries([...preserved].map((name) => [name, counts[name]])), remove: Object.fromEntries(targets.map((name) => [name, counts[name]])) }, null, 2));
  if (!execute) return;

  const backupDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'CoreStack', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `taller-before-reset-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '10s'");
    await tx.$executeRawUnsafe(`LOCK TABLE ${names.map(qualified).join(', ')} IN ACCESS EXCLUSIVE MODE`);
    const snapshots = {};
    for (const name of names) {
      // PostgreSQL serializes exact numeric values before they reach JavaScript.
      const [row] = await tx.$queryRawUnsafe(`SELECT coalesce(json_agg(t), '[]'::json)::text AS data FROM ${qualified(name)} t`);
      snapshots[name] = row.data;
    }
    const data = JSON.stringify({ format: 'postgres-table-json-text-v1', createdAt: new Date().toISOString(), schema, tables: snapshots });
    const descriptor = fs.openSync(backupPath, 'wx', 0o600);
    try { fs.writeFileSync(descriptor, data); fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
    if (digest(fs.readFileSync(backupPath)) !== digest(data)) throw new Error('Backup verification failed.');
    // No CASCADE: unreviewed dependencies cause rollback, never implicit deletion.
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${targets.map(qualified).join(', ')} RESTART IDENTITY RESTRICT`);
    for (const name of targets) {
      const [row] = await tx.$queryRawUnsafe(`SELECT count(*)::int AS count FROM ${qualified(name)}`);
      if (row.count !== 0) throw new Error('Table not empty: ' + name);
    }
    for (const name of preserved) {
      const [row] = await tx.$queryRawUnsafe(`SELECT coalesce(json_agg(t), '[]'::json)::text AS data FROM ${qualified(name)} t`);
      if (row.data !== snapshots[name]) throw new Error('Preserved data changed: ' + name);
    }
  }, { timeout: 120000, maxWait: 10000 });
  console.log(JSON.stringify({ result: 'committed', clearedTables: targets.length, backupPath }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
