const http = require('http');

const postData = '{"email":"admin@ebright.com","password":"Admin@2024!"}';

const options = {
  hostname: '127.0.0.1',
  port: 4000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('Sending:', postData);

const req = http.request(options, (res) => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { console.log('Response:', data); });
});

req.on('error', (e) => { console.error('Error:', e.message); });

req.write(postData);
req.end();
