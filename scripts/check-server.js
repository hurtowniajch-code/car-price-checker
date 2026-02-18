const { Client } = require('ssh2');
const conn = new Client();
conn.on('ready', () => {
  conn.exec('free -h && echo "---" && nproc && echo "---" && df -h / | tail -1', (err, stream) => {
    if (err) { conn.end(); return; }
    stream.on('data', d => process.stdout.write(d));
    stream.stderr.on('data', d => {});
    stream.on('close', () => conn.end());
  });
}).connect({ host: '209.38.221.144', port: 22, username: 'root', password: 'HasloDo1!Ocean', readyTimeout: 10000 });
