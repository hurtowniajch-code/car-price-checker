/**
 * Run one command on the ileoto server:
 *   node scripts/run-remote.js "cd /opt/car-price-checker && npm run crawl-catalog"
 *
 * Credentials: SSH_PASS env var, falling back to the password in deploy.js.
 */
const { Client } = require('ssh2');

const HOST = '209.38.221.144';
const USER = 'root';
const PASS = process.env.SSH_PASS || 'HasloDo1!Ocean';

const command = process.argv.slice(2).join(' ');
if (!command) {
  console.error('Usage: node scripts/run-remote.js "<command>"');
  process.exit(1);
}

const conn = new Client();
conn
  .on('ready', () => {
    conn.exec(command, (err, stream) => {
      if (err) { console.error(err); process.exit(1); }
      stream
        .on('data', (d) => process.stdout.write(d))
        .stderr.on('data', (d) => process.stderr.write(d));
      stream.on('close', (code) => { conn.end(); process.exit(code || 0); });
    });
  })
  .on('error', (err) => { console.error('SSH error:', err.message); process.exit(1); })
  .connect({ host: HOST, username: USER, password: PASS, readyTimeout: 20000 });
