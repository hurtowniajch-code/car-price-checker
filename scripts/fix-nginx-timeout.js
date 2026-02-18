const { Client } = require('ssh2');

const NGINX_CONF = `server {
    listen 80;
    server_name ileoto.pl www.ileoto.pl;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name ileoto.pl www.ileoto.pl;

    ssl_certificate /etc/letsencrypt/live/ileoto.pl/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ileoto.pl/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;

        proxy_read_timeout 180s;
        proxy_connect_timeout 10s;
        proxy_send_timeout 180s;
    }
}`;

const conn = new Client();
conn.on('ready', async () => {
  console.log('Connected');

  // First read current config to check what certbot added
  await new Promise(resolve => {
    conn.exec('cat /etc/nginx/sites-enabled/ileoto.pl', (err, stream) => {
      if (err) { resolve(); return; }
      console.log('\n--- Current config ---');
      stream.on('data', d => process.stdout.write(d));
      stream.stderr.on('data', d => {});
      stream.on('close', resolve);
    });
  });

  // Write new config with timeouts
  const writeCmd = `cat > /etc/nginx/sites-available/ileoto.pl << 'NGINXEOF'\n${NGINX_CONF}\nNGINXEOF`;
  await new Promise(resolve => {
    conn.exec(writeCmd, (err, stream) => {
      if (err) { resolve(); return; }
      stream.on('data', d => process.stdout.write(d));
      stream.stderr.on('data', d => process.stderr.write(d));
      stream.on('close', resolve);
    });
  });

  // Test and reload
  await new Promise(resolve => {
    conn.exec('nginx -t && systemctl reload nginx && echo "OK: nginx reloaded"', (err, stream) => {
      if (err) { resolve(); return; }
      stream.on('data', d => process.stdout.write(d));
      stream.stderr.on('data', d => process.stderr.write(d));
      stream.on('close', resolve);
    });
  });

  conn.end();
}).connect({ host: '209.38.221.144', port: 22, username: 'root', password: 'HasloDo1!Ocean', readyTimeout: 20000 });
