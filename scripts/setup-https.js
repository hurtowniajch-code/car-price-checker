const { Client } = require('ssh2');

const HOST = '209.38.221.144';
const USER = 'root';
const PASS = 'HasloDo1!Ocean';
const DOMAIN = 'ileoto.pl';
const EMAIL = 'admin@ileoto.pl';

const COMMANDS = [
  'apt-get install -y certbot python3-certbot-nginx',
  `certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos -m ${EMAIL} --redirect`,
  'nginx -t && systemctl reload nginx',
  'systemctl status nginx --no-pager | head -5',
  'certbot certificates',
];

function runCommands(conn, commands) {
  return new Promise((resolve, reject) => {
    let i = 0;
    function next() {
      if (i >= commands.length) { resolve(); return; }
      const cmd = commands[i++];
      console.log(`\n→ ${cmd}`);
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        stream.on('data', d => process.stdout.write(d));
        stream.stderr.on('data', d => process.stderr.write(d));
        stream.on('close', code => {
          if (code !== 0) console.log(`  (exit ${code})`);
          next();
        });
      });
    }
    next();
  });
}

const conn = new Client();
conn.on('ready', async () => {
  console.log('Connected to', HOST);
  try {
    await runCommands(conn, COMMANDS);
    console.log(`\nDone! https://${DOMAIN} is live with auto-renewing SSL.`);
  } catch (e) {
    console.error('Error:', e.message);
  }
  conn.end();
}).connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 20000 });

conn.on('error', err => { console.error('Connection error:', err.message); process.exit(1); });
