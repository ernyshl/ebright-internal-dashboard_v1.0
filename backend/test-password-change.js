const http = require('http');

// Token from previous login
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxNjAwMGU5Ni1hOThiLTQ4ODYtYWYzYy0wMzdiOGJhZTRiZmQiLCJlbWFpbCI6ImFkbWluQGNvbXBhbnkuY29tIiwicm9sZSI6InN1cGVyX2FkbWluIiwiZnVsbE5hbWUiOiJTdXBlciBBZG1pbiIsImlhdCI6MTc3MTQ3NTU0MiwiZXhwIjoxNzcxNTA0MzQyfQ.qIR8sXWds4AMNjJ4uVeDA_8yKw0zp5AuG7-NIyH9Ic8';

console.log('Test: PUT /api/auth/profile (change password with uppercase, lowercase, number, special char)');
console.log('======================================================================================\n');

const updateData = JSON.stringify({
  fullName: 'Super Admin',
  currentPassword: 'admin123',
  newPassword: 'NewPass@123'
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
