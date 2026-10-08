// Start only the isolated loopback API. Never reads a production URL or key.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const root = path.resolve('.security-runtime');
const bin = path.join(root, 'postgres', 'pgsql', 'bin');
const password = fs.readFileSync(path.join(root, 'local-password'), 'utf8').trim();
const apiPassword = crypto.randomBytes(32).toString('hex');
const sql = `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='spark_local_api') THEN CREATE ROLE spark_local_api NOINHERIT LOGIN; END IF; END $$;
ALTER ROLE spark_local_api PASSWORD '${apiPassword}'; GRANT anon TO spark_local_api;`;
execFileSync(path.join(bin, 'psql.exe'), ['-X', '-h', '127.0.0.1', '-p', '55432', '-U', 'postgres', '-d', 'spark_security', '-v', 'ON_ERROR_STOP=1'], { input: sql, env: { ...process.env, PGPASSWORD: password }, stdio: ['pipe', 'ignore', 'pipe'] });
const config = path.join(root, 'postgrest.conf');
fs.writeFileSync(config, `db-uri = "postgresql://spark_local_api:${apiPassword}@127.0.0.1:55432/spark_security"
db-schemas = "public"
db-anon-role = "anon"
server-host = "127.0.0.1"
server-port = 55433
jwt-secret = "${crypto.randomBytes(48).toString('hex')}"
`);
const log = fs.openSync(path.join(root, 'postgrest.log'), 'a');
const child = spawn(path.join(root, 'postgrest', 'postgrest.exe'), [config], { detached: true, windowsHide: true, stdio: ['ignore', log, log], env: { ...process.env, PATH: `${bin};${process.env.PATH}` } });
fs.writeFileSync(path.join(root, 'postgrest.pid'), String(child.pid));
child.unref();
console.log('Isolated API starting at http://127.0.0.1:55433 (synthetic database only).');
