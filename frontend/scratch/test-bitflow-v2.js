const fetch = require('node-fetch');

async function test() {
  try {
    const res = await fetch('https://api.bitflowapis.finance/getAllTokensAndPools');
    const data = await res.json();
    const symbols = (data.tokens || []).map(t => t.symbol);
    console.log('Available Symbols:', symbols.slice(0, 10).join(', '), '... and', symbols.length - 10, 'more');
    
    const usdc = data.tokens?.find(t => t.symbol === 'USDCx' || t.symbol === 'aeUSDC');
    console.log('USDC Token:', JSON.stringify(usdc, null, 2));

    const stx = data.tokens?.find(t => t.symbol === 'STX');
    console.log('STX Token:', JSON.stringify(stx, null, 2));
  } catch (e) {
    console.error('Fetch failed:', e.message);
  }
}

test();
