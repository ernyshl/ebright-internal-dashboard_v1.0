const http = require('http');

console.log('Test 1: Login as academy user');
console.log('============================\n');

const postData = JSON.stringify({
  email: 'academy@company.com',
  password: 'Academy@123'
});

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Status:', res.statusCode);
    const result = JSON.parse(data);
    console.log('Response:', JSON.stringify(result, null, 2));
    
    if (result.token) {
      const token = result.token;
      
      console.log('\n\nTest 2: GET profile with academy user token');
      console.log('==========================================\n');
      
      const profileOptions = {
        hostname: 'localhost',
        port: 4000,
        path: '/api/auth/profile',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      };
      
      const profileReq = http.request(profileOptions, (res2) => {
        let data2 = '';

        res2.on('data', (chunk) => {
          data2 += chunk;
        });

        res2.on('end', () => {
          console.log('Status:', res2.statusCode);
          console.log('Response:', JSON.stringify(JSON.parse(data2), null, 2));
          process.exit(0);
        });
      });
      
      profileReq.on('error', (e) => {
        console.error(`Error: ${e.message}`);
        process.exit(1);
      });
      
      profileReq.end();
    }
  });
});

req.on('error', (e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});

req.write(postData);
req.end();
