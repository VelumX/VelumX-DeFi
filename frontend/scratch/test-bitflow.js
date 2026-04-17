const fetch = require('node-fetch');

async function test() {
  try {
    const res = await fetch('https://api.bitflowapis.finance/getAllTokensAndPools');
    const data = await res.json();
    console.log('Total tokens:', data.tokens?.length);
    const stx = data.tokens?.find(t => t.symbol === 'STX' || t.tokenId === 'token-stx');
    console.log('STX Token:', JSON.stringify(stx, null, 2));
    const welsh = data.tokens?.find(t => t.symbol === 'Welsh' || t.tokenId === 'token-welsh');
    console.log('Welsh Token:', JSON.stringify(welsh, null, 2));
  } catch (e) {
    console.error('Fetch failed:', e.message);
  }
}

test();
