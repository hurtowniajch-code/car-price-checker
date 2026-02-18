const { Client } = require('ssh2');

const HOST = '209.38.221.144';
const USER = 'root';
const PASS = 'HasloDo1!Ocean';
const DOMAIN = 'ileoto.pl';

const NGINX_CONF = `server {
    listen 80;
    server_name ${DOMAIN} www.${DOMAIN};

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}`;

const COMMANDS = [
  'apt-get install -y nginx',
  `cat > /etc/nginx/sites-available/${DOMAIN} << 'NGINXEOF'\n${NGINX_CONF}\nNGINXEOF`,
  `ln -sf /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}`,
  'rm -f /etc/nginx/sites-enabled/default',
  'nginx -t',
  'systemctl enable nginx && systemctl reload nginx',
  'systemctl status nginx --no-pager | head -5',
];

function runCommands(conn, commands) {
  return new Promise((resolve, reject) => {
    let i = 0;
    function next() {
      if (i >= commands.length) { resolve(); return; }
      const cmd = commands[i++];
      console.log(`\n→ ${cmd.split('\n')[0]}${cmd.includes('\n') ? ' ...' : ''}`);
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
    console.log(`\nDone! nginx is proxying ${DOMAIN} → localhost:3001`);
    console.log(`\nNext step — enable HTTPS (run after DNS propagates):`);
    console.log(`  apt install certbot python3-certbot-nginx`);
    console.log(`  certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}`);
  } catch (e) {
    console.error('Error:', e.message);
  }
  conn.end();
}).connect({ host: HOST, port: 22, username: USER, password: PASS, readyTimeout: 20000 });

conn.on('error', err => { console.error('Connection error:', err.message); process.exit(1); });
