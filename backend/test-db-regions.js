const http = require('http');

// Token from previous login
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxNjAwMGU5Ni1hOThiLTQ4ODYtYWYzYy0wMzdiOGJhZTRiZmQiLCJlbWFpbCI6ImFkbWluQGNvbXBhbnkuY29tIiwicm9sZSI6InN1cGVyX2FkbWluIiwiZnVsbE5hbWUiOiJTdXBlciBBZG1pbiIsImlhdCI6MTc3MTQ3NTU0MiwiZXhwIjoxNzcxNTA0MzQyfQ.qIR8sXWds4AMNjJ4uVeDA_8yKw0zp5AuG7-NIyH9Ic8';

console.log('Test: Get actual regions and branches from database');
console.log('==================================================\n');

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/leads-centre?limit=1',
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
    const result = JSON.parse(data);
    console.log('Status:', res.statusCode);
    console.log('\nRegions available:', result.filters?.regions);
    console.log('\nBranches count:', result.filters?.branches?.length);
    console.log('\nAll branches:');
    result.filters?.branches?.forEach((branch, i) => {
      console.log(`  ${i + 1}. ${branch}`);
    });
    
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error('Error:', e.message);
  process.exit(1);
});

req.end();