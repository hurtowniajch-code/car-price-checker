const { Client } = require('ssh2');

const HOST = '209.38.221.144';
const USER = 'root';
const PASS = 'HasloDo1!Ocean';

const COMMANDS = [
  'cd /opt/car-price-checker && git pull origin main',
  'cd /opt/car-price-checker && npm install',
  'cd /opt/car-price-checker && npm run build',
  'pm2 restart car-price-checker || pm2 start /opt/car-price-checker/dist/server.js --name car-price-checker',
  'pm2 status',
];

function runCommands(conn, commands) {
  return new Promise((resolve, reject) => {
    const results = [];
    let i = 0;

    function next() {
      if (i >= commands.length) {
        resolve(results);
        return;
      }
      const cmd = commands[i++];
      console.log(`\n→ ${cmd}`);
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let out = '';
        stream.on('data', d => { process.stdout.write(d); out += d; });
        stream.stderr.on('data', d => { process.stderr.write(d); });
        stream.on('close', (code) => {
          results.push({ cmd, code });
          if (code !== 0) {
            console.log(`  (exit ${code})`);
          }
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
    // First check where the app lives
    await new Promise((resolve, reject) => {
      conn.exec('ls /root/car-price-checker 2>/dev/null || ls /home/*/car-price-checker 2>/dev/null || find / -name "car-price-checker" -maxdepth 4 -type d 2>/dev/null | head -5', (err, stream) => {
        if (err) return reject(err);
        let out = '';
        stream.on('data', d => { process.stdout.write(d); out += d; });
        stream.stderr.on('data', d => {});
        stream.on('close', () => resolve(out));
      });
    });

    await runCommands(conn, COMMANDS);
  } catch (e) {
    console.error('Error:', e.message);
  }
  conn.end();
}).connect({
  host: HOST,
  port: 22,
  username: USER,
  password: PASS,
  readyTimeout: 20000,
});

conn.on('error', err => {
  console.error('Connection error:', err.message);
  process.exit(1);
});
