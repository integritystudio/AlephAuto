#!/usr/bin/env node

/**
 * Setup GitHub Pages DNS for alephcondense.dev
 * Configures 4 A records and 1 CNAME record for GitHub Pages
 */

import https from 'https';

const PORKBUN_API_KEY = process.env.PORKBUN_API_KEY;
const PORKBUN_SECRET_API_KEY = process.env.PORKBUN_SECRET_API_KEY;
const DOMAIN = 'alephcondense.dev';

// GitHub Pages IP addresses
const GITHUB_IPS = [
  '185.199.108.153',
  '185.199.109.153',
  '185.199.110.153',
  '185.199.111.153'
];

function makeRequest(path, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      apikey: PORKBUN_API_KEY,
      secretapikey: PORKBUN_SECRET_API_KEY,
      ...data
    });

    const options = {
      hostname: 'api.porkbun.com',
      port: 443,
      path: `/api/json/v3${path}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${responseData}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(e);
    });

    req.write(payload);
    req.end();
  });
}

async function deleteAllRecords() {
  console.log('Fetching existing DNS records...');
  const records = await makeRequest(`/dns/retrieve/${DOMAIN}`, {});

  if (records.status !== 'SUCCESS') {
    throw new Error(`Failed to retrieve records: ${records.message || 'Unknown error'}`);
  }

  console.log(`Found ${records.records?.length || 0} existing records`);

  // Delete A and CNAME records for @ and www
  for (const record of records.records || []) {
    if ((record.type === 'A' || record.type === 'CNAME') &&
        (record.name === DOMAIN || record.name === `www.${DOMAIN}`)) {
      console.log(`Deleting ${record.type} record: ${record.name} -> ${record.content}`);
      await makeRequest(`/dns/delete/${DOMAIN}/${record.id}`, {});
    }
  }
}

async function createARecords() {
  console.log('\nCreating GitHub Pages A records...');

  for (const ip of GITHUB_IPS) {
    console.log(`Creating A record: ${DOMAIN} -> ${ip}`);
    const result = await makeRequest(`/dns/create/${DOMAIN}`, {
      type: 'A',
      name: '',  // apex domain
      content: ip,
      ttl: '600'
    });

    if (result.status !== 'SUCCESS') {
      console.error(`Failed to create A record for ${ip}: ${result.message}`);
    } else {
      console.log(`✓ Created A record: ${ip}`);
    }
  }
}

async function createCNAMERecord() {
  console.log('\nCreating CNAME record...');
  console.log(`Creating CNAME: www.${DOMAIN} -> aledlie.github.io`);

  const result = await makeRequest(`/dns/create/${DOMAIN}`, {
    type: 'CNAME',
    name: 'www',
    content: 'aledlie.github.io',
    ttl: '600'
  });

  if (result.status !== 'SUCCESS') {
    console.error(`Failed to create CNAME: ${result.message}`);
  } else {
    console.log(`✓ Created CNAME record`);
  }
}

async function verifyRecords() {
  console.log('\nVerifying DNS configuration...');
  const records = await makeRequest(`/dns/retrieve/${DOMAIN}`, {});

  if (records.status !== 'SUCCESS') {
    throw new Error(`Failed to verify records: ${records.message}`);
  }

  console.log('\nConfigured DNS records:');
  for (const record of records.records || []) {
    if (record.type === 'A' || (record.type === 'CNAME' && record.name.startsWith('www'))) {
      console.log(`  ${record.type.padEnd(5)} ${record.name.padEnd(25)} -> ${record.content}`);
    }
  }
}

async function main() {
  console.log('GitHub Pages DNS Setup for alephcondense.dev');
  console.log('='.repeat(60));

  if (!PORKBUN_API_KEY || !PORKBUN_SECRET_API_KEY) {
    console.error('Error: PORKBUN_API_KEY and PORKBUN_SECRET_API_KEY environment variables required');
    console.error('Run with: doppler run -- node setup-github-pages-dns.js');
    process.exit(1);
  }

  try {
    // Step 1: Delete existing A and CNAME records
    await deleteAllRecords();

    // Step 2-4: Create 4 A records for GitHub Pages
    await createARecords();

    // Step 5: Create CNAME for www
    await createCNAMERecord();

    // Verify
    await verifyRecords();

    console.log('\n' + '='.repeat(60));
    console.log('✓ DNS configuration complete!');
    console.log('\nNext steps:');
    console.log('1. Wait 5-30 minutes for DNS propagation');
    console.log('2. Verify with: dig alephcondense.dev +short');
    console.log('3. Check GitHub Pages: https://github.com/aledlie/alephcondense/settings/pages');
    console.log('4. Visit: https://alephcondense.dev');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main();
