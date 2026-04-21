import axios from 'axios';
import { ethers } from 'ethers';

async function test() {
  const provider = new ethers.JsonRpcProvider('https://api.avax-test.network/ext/bc/C/rpc');
  const wallet = new ethers.Wallet('0x17f774ea935fd9225418fb797ed468656306d5610f5beba8d6102c784b646631', provider);
  const USDC = new ethers.Contract('0x48FE28F7893De0d20b31FBAbcA1fDbE318fA339e', [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function balanceOf(address) view returns (uint256)',
  ], wallet);

  const bal = await USDC.balanceOf(wallet.address);
  console.log('Wallet:', wallet.address);
  console.log('USDC balance:', ethers.formatUnits(bal, 6));

  // Step 1: Fetch file from GitHub via our API
  console.log('\n=== STEP 1: Fetch file from GitHub ===');
  const gh = await axios.get('https://scbc-hacks.vercel.app/api/github/content?repo=maulana-tech/scbc-hacks&path=lib/x402-middleware.ts');
  const code = gh.data.content;
  console.log('Loaded:', gh.data.name, '(' + code.split('\n').length + ' lines,', gh.data.size, 'bytes)');
  console.log('Language:', gh.data.language);

  // Step 2: Probe code-explainer agent -> get 402
  console.log('\n=== STEP 2: Probe agent (402 Payment Required) ===');
  const probe = await axios.post('https://scbc-hacks.vercel.app/api/agents/code-explainer', {
    code: code.slice(0, 800),
    language: 'typescript',
  }, { validateStatus: () => true });

  const payReq = probe.data['x-payment-required'];
  console.log('Status:', probe.status, '(402 = Payment Required)');
  console.log('Price:', (Number(payReq.amount) / 1e6).toFixed(2), 'USDC');
  console.log('Recipient:', payReq.recipient);
  console.log('Network:', payReq.network);

  // Step 3: Pay with bot wallet (real on-chain tx)
  console.log('\n=== STEP 3: Send USDC payment on Avalanche Fuji ===');
  const tx = await USDC.transfer(payReq.recipient, payReq.amount);
  console.log('TX hash:', tx.hash);
  console.log('Waiting for confirmation...');
  await tx.wait(1);
  console.log('Confirmed on-chain!');

  // Step 4: Call agent again with payment proof
  console.log('\n=== STEP 4: Call agent with payment proof ===');
  const result = await axios.post('https://scbc-hacks.vercel.app/api/agents/code-explainer', {
    code: code.slice(0, 800),
    language: 'typescript',
  }, {
    headers: {
      'Content-Type': 'application/json',
      'X-Payment-Proof': JSON.stringify({
        txHash: tx.hash,
        recipient: payReq.recipient,
        amount: payReq.amount,
        tokenAddress: payReq.tokenAddress,
      }),
    },
  });

  console.log('\n========== AI RESULT ==========');
  const d = result.data as Record<string, unknown>;
  if (d.summary) console.log('\nSummary:', d.summary);
  if (Array.isArray(d.lineByLine)) {
    const lines = d.lineByLine as Array<{ line: string; explanation: string }>;
    console.log('\nLine-by-line:');
    for (const l of lines.slice(0, 10)) {
      console.log('  ' + l.line);
      console.log('  -> ' + l.explanation);
    }
  }

  console.log('\n========== DONE ==========');
  console.log('TX on explorer: https://testnet.snowtrace.io/tx/' + tx.hash);
}

test().catch(e => console.error('Error:', e.message || e));
