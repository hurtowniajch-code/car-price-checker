const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  conn.exec('pm2 logs car-price-checker --lines 50 --nostream 2>&1', (err, stream) => {
    if (err) { console.error(err); conn.end(); return; }
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => process.stderr.write(d));
    stream.on('close', () => conn.end());
  });
}).connect({ host: '209.38.221.144', port: 22, username: 'root', password: 'HasloDo1!Ocean', readyTimeout: 20000 });
