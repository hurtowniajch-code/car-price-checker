const { Client } = require('ssh2');

const cmd = `apt-get install -y \
  libcups2 libxfixes3 libxdamage1 libxrandr2 libgbm1 libxss1 \
  libasound2t64 libatk1.0-0 libatk-bridge2.0-0 libgtk-3-0 \
  libnss3 libnspr4 libx11-xcb1 libxcomposite1 libxext6 \
  libxi6 libxtst6 libpango-1.0-0 libcairo2 libglib2.0-0 \
  libxcb1 libxcursor1 libxrender1 libfontconfig1 \
  libdbus-1-3 libexpat1 fonts-liberation xdg-utils 2>&1`;

const conn = new Client();
conn.on('ready', () => {
  console.log('Installing Chrome dependencies...');
  conn.exec(cmd, (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', code => {
      console.log(`\nDone (exit ${code}). Restarting app...`);
      conn.exec('pm2 restart car-price-checker && pm2 status', (err2, s2) => {
        if (err2) { console.error(err2); conn.end(); return; }
        s2.on('data', d => process.stdout.write(d));
        s2.stderr.on('data', d => process.stderr.write(d));
        s2.on('close', () => conn.end());
      });
    });
  });
}).connect({ host: '209.38.221.144', port: 22, username: 'root', password: 'HasloDo1!Ocean', readyTimeout: 20000 });

conn.on('error', err => { console.error('Connection error:', err.message); process.exit(1); });
