import { Telegraf } from "telegraf";
import axios from "axios";
import { ethers } from "ethers";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const VAXA_API_URL = process.env.VAXA_API_URL || "https://scbc-hacks.vercel.app";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const BOT_PRIVATE_KEY = process.env.BOT_USDC_PRIVATE_KEY;
const USDC_ADDRESS = process.env.USDC_CONTRACT_ADDRESS || "0x48FE28F7893De0d20b31FBAbcA1fDbE318fA339e";
const DAILY_LIMIT = parseFloat(process.env.DAILY_SPEND_LIMIT || "5.00");

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN not set!");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const githubHeaders = {
  "Authorization": `Bearer ${GITHUB_TOKEN}`,
  "Accept": "application/vnd.github.v3+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

// ============== PROVIDER ==============
const provider = new ethers.JsonRpcProvider("https://api.avax-test.network/ext/bc/C/rpc");

function getBotWallet(): ethers.Wallet | null {
  if (!BOT_PRIVATE_KEY) return null;
  return new ethers.Wallet(BOT_PRIVATE_KEY, provider);
}

// ============== PAYMENT STATE ==============
const userSpent: Record<number, { daily: number; lastReset: number }> = {};
const userWallets: Record<number, string> = {};

function checkUserLimit(userId: number): boolean {
  const now = Date.now();
  if (!userSpent[userId] || now - userSpent[userId].lastReset > 86400000) {
    userSpent[userId] = { daily: 0, lastReset: now };
  }
  return userSpent[userId].daily < DAILY_LIMIT;
}

function recordSpend(userId: number, amount: number) {
  if (!userSpent[userId]) {
    userSpent[userId] = { daily: 0, lastReset: Date.now() };
  }
  userSpent[userId].daily += amount;
}

function getSpentToday(userId: number): number {
  const now = Date.now();
  if (!userSpent[userId] || now - userSpent[userId].lastReset > 86400000) return 0;
  return userSpent[userId].daily;
}

// ============== BOT WALLET PAYMENT ==============
async function payWithBotWallet(amount: string, recipient: string): Promise<string | false> {
  const wallet = getBotWallet();
  if (!wallet) return "free-mode";

  try {
    const usdc = new ethers.Contract(
      USDC_ADDRESS,
      ["function transfer(address to, uint256 amount) returns (bool)"],
      wallet
    );

    const tx = await usdc.transfer(recipient, amount);
    await tx.wait(1);
    console.log(`Paid ${amount} USDC to ${recipient.slice(0, 10)}... tx: ${tx.hash}`);
    return tx.hash;
  } catch (error) {
    console.error("Payment error:", error);
    return false;
  }
}

async function getBotBalance(): Promise<{ avax: string; usdc: string; address: string }> {
  const wallet = getBotWallet();
  if (!wallet) return { avax: "0", usdc: "0", address: "not configured" };

  const avaxBal = await provider.getBalance(wallet.address);
  const usdc = new ethers.Contract(
    USDC_ADDRESS,
    ["function balanceOf(address) view returns (uint256)"],
    provider
  );
  const usdcBal = await usdc.balanceOf(wallet.address);

  return {
    avax: parseFloat(ethers.formatEther(avaxBal)).toFixed(4),
    usdc: parseFloat(ethers.formatUnits(usdcBal, 6)).toFixed(2),
    address: wallet.address,
  };
}

// ============== AGENTS ==============
const AGENTS: Record<string, {
  name: string;
  price: string;
  description: string;
  endpoint: string;
  buildPayload: (input: string) => Record<string, unknown>;
}> = {
  "code": {
    name: "Code Review",
    price: "0.05",
    description: "Security, performance, and style analysis",
    endpoint: "/api/agents/code-review",
    buildPayload: (input) => ({ code: input, language: "javascript", focus: "general" }),
  },
  "summarize": {
    name: "Summarizer",
    price: "0.02",
    description: "Summarize text into bullets or TL;DR",
    endpoint: "/api/agents/summarize",
    buildPayload: (input) => ({ text: input, style: "paragraph", maxLength: 200 }),
  },
  "translate": {
    name: "Translator",
    price: "0.03",
    description: "Translate between 50+ languages",
    endpoint: "/api/agents/translate",
    buildPayload: (input) => {
      const parts = input.split("|");
      const text = parts[0].trim();
      const lang = (parts[1] || "id").trim();
      return { text, targetLanguage: lang };
    },
  },
  "sql": {
    name: "SQL Generator",
    price: "0.04",
    description: "Generate SQL from natural language",
    endpoint: "/api/agents/sql-generator",
    buildPayload: (input) => ({ description: input, dialect: "postgresql" }),
  },
  "regex": {
    name: "Regex Generator",
    price: "0.03",
    description: "Create regex patterns",
    endpoint: "/api/agents/regex-generator",
    buildPayload: (input) => ({ description: input, flavor: "javascript" }),
  },
  "explain": {
    name: "Code Explainer",
    price: "0.02",
    description: "Explain code in plain English",
    endpoint: "/api/agents/code-explainer",
    buildPayload: (input) => ({ code: input, language: "javascript" }),
  },
};

// ============== PAY AND CALL ==============
async function payAndCallAgent(agentKey: string, input: string, userId: number) {
  const agent = AGENTS[agentKey];
  if (!agent) return { error: "Unknown agent" };

  const priceNum = parseFloat(agent.price);

  if (!checkUserLimit(userId)) {
    return { error: `Daily limit reached (${DAILY_LIMIT} USDC). Try again tomorrow.` };
  }

  try {
    const payload = agent.buildPayload(input);

    const probe = await axios.post(`${VAXA_API_URL}${agent.endpoint}`, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
      validateStatus: () => true,
    });

    if (probe.status !== 402) {
      if (probe.status >= 400) {
        return { error: probe.data?.error || `HTTP ${probe.status}` };
      }
      recordSpend(userId, priceNum);
      return probe.data;
    }

    const paymentReq = probe.data?.["x-payment-required"];
    if (!paymentReq) return { error: "Payment required but no details returned" };

    const txHash = await payWithBotWallet(paymentReq.amount, paymentReq.recipient);
    if (!txHash) return { error: "Bot wallet payment failed. Check BOT_USDC_PRIVATE_KEY." };

    const retryRes = await axios.post(`${VAXA_API_URL}${agent.endpoint}`, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-Payment-Proof": JSON.stringify({
          txHash,
          recipient: paymentReq.recipient,
          amount: paymentReq.amount,
          tokenAddress: paymentReq.tokenAddress,
        }),
      },
      timeout: 30000,
    });

    recordSpend(userId, priceNum);
    return retryRes.data;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } }; message?: string };
    return { error: err.response?.data?.error || err.message || "Agent call failed" };
  }
}

// ============== GITHUB ==============
async function callGitHub(action: string, args: string[]): Promise<string> {
  if (!GITHUB_TOKEN) return "GITHUB_TOKEN not configured";

  try {
    if (action === "issue" && args[0] === "create") {
      const [repo, title, ...bodyParts] = args.slice(1);
      const body = bodyParts.join(" ");
      const res = await axios.post(`https://api.github.com/repos/${repo}/issues`, { title, body }, { headers: githubHeaders });
      return `Issue created!\n${res.data.html_url}`;
    }

    if (action === "issue" && args[0] === "list") {
      const repo = args[1];
      const res = await axios.get(`https://api.github.com/repos/${repo}/issues?state=open&per_page=5`, { headers: githubHeaders });
      const issues = res.data.map((i: { number: number; title: string; user: { login: string } }) =>
        `#${i.number} ${i.title} (@${i.user.login})`
      ).join("\n");
      return issues ? `Open Issues:\n${issues}` : "No open issues";
    }

    if (action === "issue" && args[0] === "view") {
      const [repo, num] = args.slice(1);
      const res = await axios.get(`https://api.github.com/repos/${repo}/issues/${num}`, { headers: githubHeaders });
      const i = res.data;
      return `#${i.number}: ${i.title}\n\n${i.body || "No description"}\n\nStatus: ${i.state} | Author: @${i.user.login}\n${i.html_url}`;
    }

    if (action === "pr" && args[0] === "list") {
      const repo = args[1];
      const res = await axios.get(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=5`, { headers: githubHeaders });
      const prs = res.data.map((p: { number: number; title: string; user: { login: string } }) =>
        `#${p.number} ${p.title} (@${p.user.login})`
      ).join("\n");
      return prs ? `Open PRs:\n${prs}` : "No open PRs";
    }

    if (action === "pr" && args[0] === "view") {
      const [repo, num] = args.slice(1);
      const res = await axios.get(`https://api.github.com/repos/${repo}/pulls/${num}`, { headers: githubHeaders });
      const p = res.data;
      return `#${p.number}: ${p.title}\n\n${p.body || "No description"}\n\n${p.base.ref} <- ${p.head.ref}\n${p.html_url}`;
    }

    if (action === "repo") {
      const repo = args[0];
      const res = await axios.get(`https://api.github.com/repos/${repo}`, { headers: githubHeaders });
      const r = res.data;
      return `${r.full_name}\n${r.description || "No description"}\n\nStars: ${r.stargazers_count} | Forks: ${r.forks_count}\nDefault: ${r.default_branch}\n${r.html_url}`;
    }

    if (action === "commits") {
      const [repo, branch] = args.slice(1);
      const res = await axios.get(`https://api.github.com/repos/${repo}/commits?per_page=5${branch ? `&sha=${branch}` : ""}`, { headers: githubHeaders });
      const commits = res.data.map((c: { sha: string; commit: { message: string }; author?: { login: string } }) =>
        `${c.sha.slice(0, 7)} ${c.commit.message.split("\n")[0].slice(0, 50)} (${c.author?.login || "?"})`
      ).join("\n");
      return commits ? `Recent Commits:\n${commits}` : "No commits";
    }

    if (action === "branches") {
      const repo = args[0];
      const res = await axios.get(`https://api.github.com/repos/${repo}/branches`, { headers: githubHeaders });
      return res.data.map((b: { name: string }) => b.name).join("\n") || "No branches";
    }

    return `Unknown action. Try:\n/github issue create <repo> <title> <body>\n/github issue list <repo>\n/github repo <owner/repo>\n/github commits <repo>`;
  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } }; message?: string };
    return `Error: ${err.response?.data?.message || err.message}`;
  }
}

// ============== FORMAT RESULT ==============
function formatResult(result: unknown, agentName: string, price: string): string {
  if (typeof result === "string") return result;
  const r = result as Record<string, unknown>;
  if (r.error) return `Error: ${r.error}`;

  switch (agentName) {
    case "Code Review": {
      const issues = (r.issues as Array<{ severity: string; message: string; line?: number }>) || [];
      const issueText = issues.map((i) => `[${i.severity.toUpperCase()}]${i.line ? ` Line ${i.line}:` : ""} ${i.message}`).join("\n");
      return `Paid: ${price} USDC\n\nScore: ${r.score}/100\n\nIssues:\n${issueText || "None"}\n\n${r.summary || ""}`;
    }
    case "Summarizer":
      return `Paid: ${price} USDC\n\nSummary:\n${r.summary}\n\nWords: ${r.wordCount}`;
    case "Translator":
      return `Paid: ${price} USDC\n\n${r.translatedText}\n\nDetected: ${r.detectedSourceLanguage}`;
    case "SQL Generator": {
      let text = `Paid: ${price} USDC\n\nSQL:\n\`\`\`\n${r.query}\n\`\`\`\n\n${r.explanation || ""}`;
      if (r.warnings) text += `\n\nWarnings: ${(r.warnings as string[]).join(", ")}`;
      return text;
    }
    case "Regex Generator":
      return `Paid: ${price} USDC\n\nPattern: /${r.pattern}/${r.flags || ""}\n\n${r.explanation || ""}`;
    case "Code Explainer": {
      const lines = (r.lineByLine as Array<{ line: string; explanation: string }>) || [];
      const lineText = lines.map((l) => `${l.line}\n  -> ${l.explanation}`).join("\n\n");
      return `Paid: ${price} USDC\n\n${r.summary || ""}\n\n${lineText}`;
    }
    default:
      return JSON.stringify(result, null, 2);
  }
}

// ============== COMMANDS ==============
bot.start((ctx) => {
  const userId = ctx.from.id;
  const spent = getSpentToday(userId);
  ctx.reply(
    `Vaxa Bot - AI Agent Marketplace\n\n` +
    `AI Agents (bot pays!):\n` +
    `/code <code> - Code review (0.05 USDC)\n` +
    `/summarize <text> - Summarize (0.02 USDC)\n` +
    `/translate <text> | <lang> - Translate (0.03 USDC)\n` +
    `/sql <desc> - SQL gen (0.04 USDC)\n` +
    `/regex <desc> - Regex gen (0.03 USDC)\n` +
    `/explain <code> - Explain (0.02 USDC)\n\n` +
    `GitHub (free):\n` +
    `/github issue|pr|repo|commits ...\n\n` +
    `Wallet:\n` +
    `/wallet - Bot wallet info\n` +
    `/connect <address> - Link your wallet\n` +
    `/balance - Your spending\n\n` +
    `Spent today: ${spent.toFixed(2)} / ${DAILY_LIMIT.toFixed(2)} USDC\n\n` +
    `/help - Full help`
  );
});

bot.help((ctx) => {
  ctx.reply(
    `Commands:\n\n` +
    `AI Agents:\n` +
    `/code <code> - Review code\n` +
    `/summarize <text> - Summarize\n` +
    `/translate <text> | <lang> - Translate (default: id)\n` +
    `/sql <desc> - Generate SQL\n` +
    `/regex <desc> - Generate regex\n` +
    `/explain <code> - Explain code\n\n` +
    `GitHub:\n` +
    `/github issue create <repo> <title> <body>\n` +
    `/github issue list <repo>\n` +
    `/github pr list <repo>\n` +
    `/github repo <owner/repo>\n` +
    `/github commits <repo>\n\n` +
    `Wallet:\n` +
    `/wallet - Bot wallet balance\n` +
    `/connect <address> - Link your wallet\n` +
    `/balance - Your spending stats`
  );
});

bot.command("agents", (ctx) => {
  const list = Object.entries(AGENTS).map(([cmd, a]) =>
    `/${cmd} - ${a.name} (${a.price} USDC)\n  ${a.description}`
  ).join("\n\n");
  ctx.reply(`AI Agents (bot pays!):\n\n${list}\n\nDaily limit: ${DAILY_LIMIT} USDC`);
});

bot.command("wallet", async (ctx) => {
  try {
    const bal = await getBotBalance();
    ctx.reply(
      `Bot Wallet:\n\n` +
      `Address: ${bal.address}\n` +
      `AVAX: ${bal.avax}\n` +
      `USDC: ${bal.usdc}\n\n` +
      `Network: Avalanche Fuji (43113)\n` +
      `Explorer: https://testnet.snowtrace.io/address/${bal.address}`
    );
  } catch {
    ctx.reply("Could not fetch wallet balance. Check BOT_USDC_PRIVATE_KEY.");
  }
});

bot.command("connect", (ctx) => {
  const address = ctx.message.text.slice(8).trim();
  if (!address || !address.startsWith("0x") || address.length !== 42) {
    ctx.reply("Usage: /connect 0xYourWalletAddress\n\nLink your wallet to track spending on-chain.");
    return;
  }
  userWallets[ctx.from.id] = address;
  ctx.reply(`Wallet linked: ${address}\n\nView on explorer:\nhttps://testnet.snowtrace.io/address/${address}`);
});

bot.command("balance", (ctx) => {
  const userId = ctx.from.id;
  const spent = getSpentToday(userId);
  const wallet = userWallets[userId];
  ctx.reply(
    `Your Stats:\n\n` +
    `Spent today: ${spent.toFixed(2)} / ${DAILY_LIMIT.toFixed(2)} USDC\n` +
    `Remaining: ${(DAILY_LIMIT - spent).toFixed(2)} USDC\n` +
    `Linked wallet: ${wallet || "not linked (use /connect)"}`
  );
});

bot.command("github", async (ctx) => {
  const text = ctx.message.text.slice(8).trim();
  if (!text) {
    ctx.reply(
      "Usage:\n" +
      "/github issue create <repo> <title> <body>\n" +
      "/github issue list <repo>\n" +
      "/github pr list <repo>\n" +
      "/github repo <owner/repo>\n" +
      "/github commits <repo>"
    );
    return;
  }

  const parts = text.split(" ");
  const action = parts[0];
  const args = parts.slice(1);

  ctx.reply("Processing...");
  const result = await callGitHub(action, args);
  ctx.reply(result);
});

// ============== AI AGENT COMMANDS ==============
Object.entries(AGENTS).forEach(([command, agent]) => {
  bot.command(command, async (ctx) => {
    const input = ctx.message.text.slice(command.length + 1).trim();
    const userId = ctx.from.id;

    if (!input) {
      const examples: Record<string, string> = {
        code: "/code function fib(n) { return n <= 1 ? n : fib(n-1) + fib(n-2); }",
        summarize: "/summarize The meeting discussed Q3 results with 15% growth...",
        translate: "/translate Hello world | id",
        sql: "/sql Get all users who signed up last month",
        regex: "/regex Match email addresses",
        explain: "/explain const memo = (fn) => { const cache = {}; return (...args) => cache[args] || (cache[args] = fn(...args)); };",
      };
      ctx.reply(
        `${agent.name} - ${agent.price} USDC (bot pays!)\n\n` +
        `${agent.description}\n\n` +
        `Example:\n${examples[command] || `/${command} <your input>`}`
      );
      return;
    }

    const spent = getSpentToday(userId);
    ctx.reply(`${agent.name} (${agent.price} USDC)...\nSpent today: ${spent.toFixed(2)} / ${DAILY_LIMIT.toFixed(2)} USDC`);

    const result = await payAndCallAgent(command, input, userId);
    const formatted = formatResult(result, agent.name, agent.price);
    ctx.reply(formatted);
  });
});

// ============== ESCROW ==============
bot.command("escrow", async (ctx) => {
  const text = ctx.message.text.slice(8).trim();
  const parts = text.split(" ");
  const agentKey = parts[0];
  const input = parts.slice(1).join(" ");

  if (!agentKey || !input) {
    ctx.reply(
      "Smart Escrow - Hold payment until task is complete.\n\n" +
      "Usage: /escrow <agent> <task>\n\n" +
      "Agents: code, summarize, translate, sql, regex, explain\n\n" +
      "Example:\n/escrow code function test() { return 42; }"
    );
    return;
  }

  const agent = AGENTS[agentKey];
  if (!agent) {
    ctx.reply(`Unknown agent: ${agentKey}\n\nAvailable: code, summarize, translate, sql, regex, explain`);
    return;
  }

  try {
    const escrowRes = await axios.post(`${VAXA_API_URL}/api/escrow/create`, {
      agentType: agentKey,
      description: input,
      amount: agent.price,
    }, { timeout: 10000 });

    const escrow = escrowRes.data;
    ctx.reply(
      `Escrow Created!\n\n` +
      `ID: ${escrow.id}\n` +
      `Agent: ${agent.name}\n` +
      `Amount: ${agent.price} USDC\n` +
      `Status: pending\n\n` +
      `Task: ${input}\n\n` +
      `Use:\n/escrow-execute ${escrow.id}\n/escrow-approve ${escrow.id}\n/escrow-reject ${escrow.id}`
    );
  } catch {
    ctx.reply("Escrow creation failed. The escrow API might not be available.");
  }
});

bot.command("escrow-execute", async (ctx) => {
  const id = ctx.message.text.split(" ")[1];
  if (!id) { ctx.reply("Usage: /escrow-execute <id>"); return; }

  try {
    const res = await axios.post(`${VAXA_API_URL}/api/escrow/${id}/execute`, {}, { timeout: 15000 });
    ctx.reply(`Escrow executed!\n\nStatus: ${res.data.status}\nResult: ${JSON.stringify(res.data.result || "pending")}`);
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } } };
    ctx.reply(`Execute failed: ${err.response?.data?.error || "unknown error"}`);
  }
});

bot.command("escrow-approve", async (ctx) => {
  const id = ctx.message.text.split(" ")[1];
  if (!id) { ctx.reply("Usage: /escrow-approve <id>"); return; }

  try {
    const res = await axios.post(`${VAXA_API_URL}/api/escrow/${id}/approve`, {}, { timeout: 15000 });
    ctx.reply(`Escrow approved!\n\nStatus: ${res.data.status}\nFunds released to agent.`);
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } } };
    ctx.reply(`Approve failed: ${err.response?.data?.error || "unknown error"}`);
  }
});

bot.command("escrow-reject", async (ctx) => {
  const id = ctx.message.text.split(" ")[1];
  if (!id) { ctx.reply("Usage: /escrow-reject <id>"); return; }

  try {
    const res = await axios.post(`${VAXA_API_URL}/api/escrow/${id}/reject`, {}, { timeout: 15000 });
    ctx.reply(`Escrow rejected.\n\nStatus: ${res.data.status}\nFunds returned.`);
  } catch (error: unknown) {
    const err = error as { response?: { data?: { error?: string } } };
    ctx.reply(`Reject failed: ${err.response?.data?.error || "unknown error"}`);
  }
});

// ============== LAUNCH ==============
bot.launch().then(() => {
  console.log("Vaxa Bot started!");
  console.log(`API: ${VAXA_API_URL}`);
  console.log(`Daily limit: ${DAILY_LIMIT} USDC/user`);
  console.log(`Bot wallet: ${BOT_PRIVATE_KEY ? "configured" : "not set (free mode)"}`);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
