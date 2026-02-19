const http = require('http');

// Token from previous login
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxNjAwMGU5Ni1hOThiLTQ4ODYtYWYzYy0wMzdiOGJhZTRiZmQiLCJlbWFpbCI6ImFkbWluQGNvbXBhbnkuY29tIiwicm9sZSI6InN1cGVyX2FkbWluIiwiZnVsbE5hbWUiOiJTdXBlciBBZG1pbiIsImlhdCI6MTc3MTQ3NTU0MiwiZXhwIjoxNzcxNTA0MzQyfQ.qIR8sXWds4AMNjJ4uVeDA_8yKw0zp5AuG7-NIyH9Ic8';

console.log('Test 1: GET /api/auth/profile');
console.log('============================\n');

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/auth/profile',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', JSON.stringify(JSON.parse(data), null, 2));
    
    // Now test PUT /api/auth/profile
    console.log('\n\nTest 2: PUT /api/auth/profile (update name)');
    console.log('============================================\n');
    
    const updateData = JSON.stringify({
      fullName: 'Super Admin Updated'
    });
    
    const putOptions = {
      hostname: 'localhost',
      port: 4000,
      path: '/api/auth/profile',
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(updateData)
      }
    };
    
    const putReq = http.request(putOptions, (res2) => {
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
    
    putReq.on('error', (e) => {
      console.error(`Error: ${e.message}`);
      process.exit(1);
    });
    
    putReq.write(updateData);
    putReq.end();
  });
});

req.on('error', (e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});

req.end();
