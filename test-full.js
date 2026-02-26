// Test login through nginx proxy (HTTPS -> backend)
const https = require('https');

const postData = JSON.stringify({
  email: 'admin@ebright.com',
  password: 'Admin@2024!'
});

console.log('=== Test 1: Direct to backend on port 4000 ===');
const http = require('http');
const req1 = http.request({
  hostname: '127.0.0.1',
  port: 4000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data.substring(0, 200));
    
    console.log('\n=== Test 2: Through nginx on port 443 ===');
    const req2 = https.request({
      hostname: '127.0.0.1',
      port: 443,
      path: '/api/auth/login',
      method: 'POST',
      rejectUnauthorized: false,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res2) => {
      let data2 = '';
      res2.on('data', (chunk) => data2 += chunk);
      res2.on('end', () => {
        console.log('Status:', res2.statusCode);
        console.log('Response:', data2.substring(0, 200));
      });
    });
    req2.on('error', (e) => console.error('Error:', e.message));
    req2.write(postData);
    req2.end();
  });
});
req1.on('error', (e) => console.error('Error:', e.message));
req1.write(postData);
req1.end();
