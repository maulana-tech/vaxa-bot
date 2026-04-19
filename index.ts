import { Telegraf } from "telegraf";
import axios from "axios";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const VAXA_API_URL = process.env.VAXA_API_URL || "https://scbc-hacks.vercel.app";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN not set!");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const headers = {
  "Authorization": `Bearer ${GITHUB_TOKEN}`,
  "Accept": "application/vnd.github.v3+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

const AGENTS: Record<string, { name: string; price: string; description: string; endpoint: string; payloadKey: string }> = {
  "code": { 
    name: "Code Review", 
    price: "0.05", 
    description: "Analyze code for security, performance, style",
    endpoint: "/api/agents/code-review",
    payloadKey: "code"
  },
  "summarize": { 
    name: "Summarizer", 
    price: "0.02", 
    description: "Summarize text into bullets or TL;DR",
    endpoint: "/api/agents/summarize",
    payloadKey: "text"
  },
  "translate": { 
    name: "Translator", 
    price: "0.03", 
    description: "Translate between 50+ languages",
    endpoint: "/api/agents/translate",
    payloadKey: "text"
  },
  "sql": { 
    name: "SQL Generator", 
    price: "0.04", 
    description: "Generate SQL from natural language",
    endpoint: "/api/agents/sql-generator",
    payloadKey: "description"
  },
  "regex": { 
    name: "Regex Generator", 
    price: "0.03", 
    description: "Create regex patterns",
    endpoint: "/api/agents/regex-generator",
    payloadKey: "pattern"
  },
  "explain": { 
    name: "Code Explainer", 
    price: "0.02", 
    description: "Explain code in plain English",
    endpoint: "/api/agents/code-explainer",
    payloadKey: "code"
  },
};

async function callVaxaAgent(agent: typeof AGENTS[string], input: string, language?: string) {
  try {
    const payload: Record<string, unknown> = { [agent.payloadKey]: input };
    if (language) payload.language = language;
    
    const response = await axios.post(`${VAXA_API_URL}${agent.endpoint}`, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    });
    
    return response.data;
  } catch (error: unknown) {
    const err = error as { response?: { data: { error?: string } }; message?: string };
    return { error: err.response?.data?.error || err.message || "Agent call failed" };
  }
}

async function callGitHub(action: string, args: string[]) {
  if (!GITHUB_TOKEN) return "❌ GITHUB_TOKEN not configured";
  
  try {
    if (action === "issue" && args[0] === "create") {
      const [repo, title, ...bodyParts] = args.slice(1);
      const body = bodyParts.join(" ");
      const res = await axios.post(`https://api.github.com/repos/${repo}/issues`, { title, body }, { headers });
      return `✅ Issue created!\n${res.data.html_url}`;
    }
    
    if (action === "issue" && args[0] === "list") {
      const repo = args[1];
      const res = await axios.get(`https://api.github.com/repos/${repo}/issues?state=open&per_page=5`, { headers });
      const issues = res.data.map((i: { number: number; title: string; user: { login: string } }) => 
        `#${i.number} ${i.title} (by @${i.user.login})`
      ).join("\n");
      return issues ? `📋 *Open Issues*\n${issues}` : "No open issues";
    }
    
    if (action === "issue" && args[0] === "view") {
      const [repo, num] = args.slice(1);
      const res = await axios.get(`https://api.github.com/repos/${repo}/issues/${num}`, { headers });
      const i = res.data;
      return `📋 *#${i.number}: ${i.title}*\n\n${i.body || "_No description_"}\n\nStatus: ${i.state}\nAuthor: @${i.user.login}\n${i.html_url}`;
    }
    
    if (action === "pr" && args[0] === "list") {
      const repo = args[1];
      const res = await axios.get(`https://api.github.com/repos/${repo}/pulls?state=open&per_page=5`, { headers });
      const prs = res.data.map((p: { number: number; title: string; user: { login: string } }) => 
        `#${p.number} ${p.title} (by @${p.user.login})`
      ).join("\n");
      return prs ? `🔀 *Open PRs*\n${prs}` : "No open PRs";
    }
    
    if (action === "pr" && args[0] === "view") {
      const [repo, num] = args.slice(1);
      const res = await axios.get(`https://api.github.com/repos/${repo}/pulls/${num}`, { headers });
      const p = res.data;
      return `🔀 *#${p.number}: ${p.title}*\n\n${p.body || "_No description_"}\n\nState: ${p.state}\nAuthor: @${p.user.login}\nBase: ${p.base.ref} ← Head: ${p.head.ref}\n${p.html_url}`;
    }
    
    if (action === "repo") {
      const repo = args[0];
      const res = await axios.get(`https://api.github.com/repos/${repo}`, { headers });
      const r = res.data;
      return `📦 *${r.full_name}*\n${r.description || "_No description_"}\n\n⭐ ${r.stargazers_count} stars\n🍴 ${r.forks_count} forks\n🗋 Default: ${r.default_branch}\n${r.html_url}`;
    }
    
    if (action === "commits") {
      const [repo, branch] = args.slice(1);
      const res = await axios.get(`https://api.github.com/repos/${repo}/commits?per_page=5${branch ? `&sha=${branch}` : ""}`, { headers });
      const commits = res.data.map((c: { sha: string; commit: { message: string }; author: { login: string } }) => 
        `• ${c.sha.slice(0,7)} ${c.commit.message.split("\n")[0].slice(0,50)} (${c.author?.login || "unknown"})`
      ).join("\n");
      return commits ? `📜 *Recent Commits*\n${commits}` : "No commits";
    }
    
    if (action === "branches") {
      const repo = args[0];
      const res = await axios.get(`https://api.github.com/repos/${repo}/branches`, { headers });
      const branches = res.data.map((b: { name: string; protected: boolean }) => 
        `${b.protected ? "🔒" : "📄"} ${b.name}`
      ).join("\n");
      return branches ? `🌿 *Branches*\n${branches}` : "No branches";
    }
    
    if (action === "search") {
      const query = args.join(" ");
      const res = await axios.get(`https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=5`, { headers });
      const results = res.data.items?.map((r: { path: string; repository: { full_name: string } }) => 
        `${r.repository.full_name}:${r.path}`
      ).join("\n");
      return results ? `🔍 *Search Results*\n${results}` : "No results";
    }
    
    return `❌ Unknown action. Try:\n/github issue create <repo> <title> <body>\n/github issue list <repo>\n/github issue view <repo> <num>\n/github pr list <repo>\n/github pr view <repo> <num>\n/github repo <owner/repo>\n/github commits <repo> [branch]\n/github branches <repo>\n/github search <query>`;
  } catch (error: unknown) {
    const err = error as { response?: { data: { message?: string } }; message?: string };
    return `❌ Error: ${err.response?.data?.message || err.message}`;
  }
}

function getExample(cmd: string): string {
  const examples: Record<string, string> = {
    "code": "`function fib(n) { return n <= 1 ? n : fib(n-1) + fib(n-2); }`",
    "summarize": `"Meeting discusses Q3 results with 15% growth..."`,
    "translate": `"Hello world" → Spanish`,
    "sql": `"Get all users with orders > 5"`,
    "regex": `"Match email addresses"`,
    "explain": "`const add = (a, b) => a + b;`",
  };
  return examples[cmd] || "your input";
}

function formatResult(result: unknown, agentName: string): string {
  if (typeof result === "string") return result;
  
  const r = result as Record<string, unknown>;
  
  if (r.error) return `❌ ${r.error}`;
  
  switch (agentName) {
    case "Code Review":
      return `📋 *Issues Found:*\n${(r.issues as { severity: string; message: string }[] | undefined)?.map((i) => 
        `[${i.severity}] ${i.message}`).join("\n") || "No issues"}\n\nScore: ${r.score}/100`;
    
    case "Summarizer":
      return `📝 *Summary:*\n${r.summary}`;
    
    case "Translator":
      return `🌍 *Translation:*\n${r.translatedText}\n\nDetected: ${r.detectedSourceLanguage}`;
    
    case "SQL Generator":
      return `📊 *SQL:*\n\`\`\`sql\n${r.query}\n\`\`\`\n\n${r.explanation || ""}`;
    
    case "Regex Generator":
      return `🔍 *Pattern:*\n\`\`\`\n${r.pattern}\n\`\`\`\n\n${r.explanation || ""}`;
    
    case "Code Explainer":
      return `💡 *Explanation:*\n${r.explanation}\n\n${r.lineByLine ? "Lines:\n" + (r.lineByLine as string[]).join("\n") : ""}`;
    
    default:
      return JSON.stringify(result, null, 2);
  }
}

bot.start((ctx) => {
  ctx.replyWithMarkdown(`🤖 *Vaxa Bot*\n\nYour AI agent + GitHub assistant.\n\n*AI Agents:*\n/code - Code review\n/summarize - Summarize\n/translate - Translate\n/sql - SQL gen\n/regex - Regex gen\n/explain - Explain\n\n*GitHub:*\n/github issue create <repo> <title>\n/github issue list <repo>\n/github pr list <repo>\n/github repo <owner/repo>\n/github commits <repo>\n\n/help - Full help`);
});

bot.help((ctx) => {
  ctx.replyWithMarkdown(`📋 *Commands*\n\n*AI Agents:*\n/code <code> - Code review (0.05 USDC)\n/summarize <text> - Summarize (0.02 USDC)\n/translate <text> - Translate (0.03 USDC)\n/sql <desc> - SQL gen (0.04 USDC)\n/regex <pattern> - Regex gen (0.03 USDC)\n/explain <code> - Explain (0.02 USDC)\n\n*GitHub:*\n/github issue create <repo> <title> <body>\n/github issue list <repo>\n/github issue view <repo> <num>\n/github pr list <repo>\n/github pr view <repo> <num>\n/github repo <owner/repo>\n/github commits <repo>\n/github branches <repo>\n/github search <query>`);
});

bot.command("agents", (ctx) => {
  const list = Object.entries(AGENTS).map(([cmd, a]) => 
    `/${cmd} — ${a.price} USDC\n   ${a.description}`
  ).join("\n\n");
  ctx.replyWithMarkdown(`🤖 *AI Agents*\n\n${list}`);
});

bot.command("github", async (ctx) => {
  const text = ctx.message.text.slice(8).trim();
  if (!text) {
    ctx.reply("Usage: /github <action> <repo> [args]\n\nExamples:\n/github issue create owner/repo \"Title\" \"Body\"\n/github issue list owner/repo\n/github repo owner/repo");
    return;
  }
  
  const parts = text.split(" ");
  const action = parts[0];
  const args = parts.slice(1);
  
  ctx.reply("⏳ Processing...");
  const result = await callGitHub(action, args);
  ctx.replyWithMarkdown(result);
});

Object.entries(AGENTS).forEach(([command, agent]) => {
  bot.command(command, async (ctx) => {
    const input = ctx.message.text.slice(command.length + 1).trim();
    
    if (!input) {
      ctx.replyWithMarkdown(`📝 *${agent.name}*\n\nSend your ${agent.payloadKey}:\n\nPrice: ${agent.price} USDC\nExample: ${getExample(command)}`);
      return;
    }
    
    ctx.reply(`⏳ Calling ${agent.name}...`);
    
    const language = command === "code" || command === "explain" ? "javascript" : undefined;
    const result = await callVaxaAgent(agent, input, language);
    
    const formatted = formatResult(result, agent.name);
    ctx.replyWithMarkdown(formatted);
  });
});

import http from "http";

const PORT = parseInt(process.env.PORT || "8080", 10);
const WEBHOOK_PATH = "/webhook";
const WEBHOOK_DOMAIN = process.env.WEBHOOK_DOMAIN;

if (WEBHOOK_DOMAIN) {
  const url = WEBHOOK_DOMAIN.replace(/\/$/, "") + WEBHOOK_PATH;
  bot.telegram.setWebhook(url);
  bot.startWebhook(WEBHOOK_PATH, null, PORT);
  console.log(`🤖 Bot started (webhook) port ${PORT}, url: ${url}`);
} else {
  const server = http.createServer((_, res) => { res.writeHead(200); res.end("ok"); });
  server.listen(PORT, () => console.log(`Health check on port ${PORT}`));
  bot.launch().then(() => console.log("🤖 Bot started (polling)"));
}

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

console.log("🚀 Vaxa Telegram Bot (GitHub + AI Agents)");
console.log(`API: ${VAXA_API_URL}`);