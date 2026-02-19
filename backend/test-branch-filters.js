const http = require('http');

// Token from previous login
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxNjAwMGU5Ni1hOThiLTQ4ODYtYWYzYy0wMzdiOGJhZTRiZmQiLCJlbWFpbCI6ImFkbWluQGNvbXBhbnkuY29tIiwicm9sZSI6InN1cGVyX2FkbWluIiwiZnVsbE5hbWUiOiJTdXBlciBBZG1pbiIsImlhdCI6MTc3MTQ3NTU0MiwiZXhwIjoxNzcxNTA0MzQyfQ.qIR8sXWds4AMNjJ4uVeDA_8yKw0zp5AuG7-NIyH9Ic8';

console.log('Test 1: Get branches with NO region filter (should show all branches)');
console.log('======================================================================\n');

const options1 = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/leads-centre?limit=1',
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
};

const req1 = http.request(options1, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    const result = JSON.parse(data);
    console.log('Status:', res.statusCode);
    console.log('Regions available:', result.filters?.regions);
    console.log('Branches count:', result.filters?.branches?.length);
    console.log('Sample branches:', result.filters?.branches?.slice(0, 10));
    
    console.log('\n\nTest 2: Get branches with Region 2 filter (should show non-Online branches)');
    console.log('========================================================================\n');
    
    const options2 = {
      hostname: 'localhost',
      port: 4000,
      path: '/api/leads-centre?region=Region%202&limit=1',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };
    
    const req2 = http.request(options2, (res2) => {
      let data2 = '';

      res2.on('data', (chunk) => {
        data2 += chunk;
      });

      res2.on('end', () => {
        const result2 = JSON.parse(data2);
        console.log('Status:', res2.statusCode);
        console.log('Branches count:', result2.filters?.branches?.length);
        console.log('Sample branches:', result2.filters?.branches?.slice(0, 10));
        
        console.log('\n\nTest 3: Get branches with Region 3 filter (should show Online branches)');
        console.log('=======================================================================\n');
        
        const options3 = {
          hostname: 'localhost',
          port: 4000,
          path: '/api/leads-centre?region=Region%203&limit=1',
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        };
        
        const req3 = http.request(options3, (res3) => {
          let data3 = '';

          res3.on('data', (chunk) => {
            data3 += chunk;
          });

          res3.on('end', () => {
            const result3 = JSON.parse(data3);
            console.log('Status:', res3.statusCode);
            console.log('Branches count:', result3.filters?.branches?.length);
            console.log('Sample branches:', result3.filters?.branches?.slice(0, 10));
            
            console.log('\n\n=== SUMMARY ===');
            console.log('All regions:', result.filters?.regions);
            console.log('All branches count:', result.filters?.branches?.length);
            console.log('Region 2 branches count:', result2.filters?.branches?.length);
            console.log('Region 3 branches count:', result3.filters?.branches?.length);
            
            process.exit(0);
          });
        });
        
        req3.on('error', (e) => {
          console.error('Error:', e.message);
          process.exit(1);
        });
        
        req3.end();
      });
    });
    
    req2.on('error', (e) => {
      console.error('Error:', e.message);
      process.exit(1);
    });
    
    req2.end();
  });
});

req1.on('error', (e) => {
  console.error('Error:', e.message);
  process.exit(1);
});

req1.end();