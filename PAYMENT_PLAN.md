# Payment Integration Plan - Telegram Bot

## Current State

### Web Marketplace (✅ Done)
- Payment: x402 + RainbowKit wallet
- User connect wallet → pay USDC → get result
- Reputation tracking on-chain (ERC-8004)

### Telegram Bot (🔄 In Progress)
- Payment: None (gratis demo saat ini)
- Commands work - tapi tidak ada payment

---

## Goal

### Telegram Bot Payment Flow:

```
User: /code function fib()...

Bot: 💰 Price: 0.05 USDC
    ❌ Payment required
    [Pay 0.05 USDC] button
```

---

## Option 1: Full Payment (x402 + On-chain)

**Pros:**
- Sama seperti web marketplace
- Reputation on-chain (ERC-8004)
- Trustless, verifiable

**Cons:**
- User perlu connect wallet
- complex untuk Telegram
- Perlu sign transaction dari Telegram

---

## Option 2: Simple Payment (Bot Wallet)

**How:**
- Bot punya hot wallet dengan USDC
- User tidak perlu bayar langsung
- Tapi:限制 spending limits
- Rugged: user perlu trust bot

**Pros:**
- User mudah - langsung jalan
- Tidak perlu wallet connect
- cocok untuk demo

**Cons:**
- Centralized
- User tidak bisa verify payment

---

## Recommended: Option 2 (Simple First)

###理由 untuk Hackathon:
1. User tidak perlu setup wallet
2. Langsung coba AI agents
3. Tidak ribet
4. Demo friendly
5. Nanti升级 ke Option 1

---

## Implementation Plan

### Step 1: Bot Pays for User (Simple)

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│  User      │      │  Bot        │      │  Vaxa API  │
│  (Telegram)│─────▶│  (Railway) │─────▶│  (Vercel) │
│            │      │  pays USDC  │      │           │
└─────────────┘      └──────────────┘      └─────────────┘
```

**ENV untuk Bot:**
```bash
BOT_USDC_PRIVATE_KEY=0x...  # Bot's wallet with USDC
DAILY_SPEND_LIMIT=5.00   # Max $5/hari
```

### Step 2: User Connects Wallet (Optional)

- User bisa connect wallet via wallet connect link
- Nanti bisa pay sendiri

### Step 3: Full x402 (Future)

- Bukan prioritas untuk hackathon

---

## Commands dengan Pricing

| Command | Price | Status |
|---------|-------|-------|
| `/code` | 0.05 USDC | Paid by bot |
| `/summarize` | 0.02 USDC | Paid by bot |
| `/translate` | 0.03 USDC | Paid by bot |
| `/sql` | 0.04 USDC | Paid by bot |
| `/regex` | 0.03 USDC | Paid by bot |
| `/explain` | 0.02 USDC | Paid by bot |
| `/github` | Free | GitHub API |

---

## Files to Modify

1. `vaxa-bot/index.ts` - Add payment logic
2. `vaxa-bot/railway.json` - Add env vars
3. `.env.example` - Add BOT_USDC_PRIVATE_KEY

---

## Execution

```bash
# 1. Setup bot wallet dengan USDC
# 2. Add env var ke Railway
# 3. Deploy bot baru
# 4. Test
```

---

## Summary

| Component | Payment | Complexity |
|-----------|---------|------------|
| Web Marketplace | x402 + wallet | High |
| Telegram Bot (Now) | Free | Easy |
| Telegram Bot (Target) | Bot pays | Medium |

**Target Hackathon Demo:**
- user coba AI agents langsung di Telegram
- Bot handle payment
- GitHub integration jalan
- Tidak perlu wallet setup