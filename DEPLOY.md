# Railway Deployment Guide (Web Dashboard)

## Prerequisites

1. **Telegram Bot Token** - Get from @BotFather
2. **GitHub Token** - Personal access token
3. **Railway account** - Sign up at railway.app

---

## Step 1: Get Telegram Bot Token

1. **Buka Telegram** dan chat dengan @BotFather
2. Kirim pesan: `/newbot`
3. Masukkan nama bot (contoh: `VaxaBot`)
4. Masukkan username bot (contoh: `vaxa_bot` - harus diakhiri dengan `bot`)
5. **SIMPAN TOKEN** yang diberikan (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
YOUR_TELEGRAM_BOT_TOKEN

---

## Step 2: Get GitHub Token

1. Buka: https://github.com/settings/tokens
2. Klik "Generate new token (classic)"
3. Isi note: `Vaxa Bot`
4. ✅ Pilih scope: `repo` (centang semua yang ada di bawahnya)
5. Klik "Generate token"
6. **SIMPAN TOKEN** yang diberikan (format: `ghp_xxxxxxxxxxxxxxxxxxxx`)
YOUR_GITHUB_TOKEN

---

## Step 3: Deploy ke Railway (via Web)

### A. Push Kode ke GitHub

```bash
# Cara 1: Buat repo baru, push folder vaxa-bot
cd vaxa-bot
git init
git add .
git commit -m "Vaxa bot"
git branch -M main
git remote add origin https://github.com/USERNAME/vaxa-bot.git
git push -u origin main
```

---

## Step 3B: Setting Root Path di Railway

Setelah connect GitHub repo:

1. Di Railway, saat select repo → akan ada dropdown **"Root directory"**
2. Pilih **`vaxa-bot/`** ← PENTING!
3. Atau jika file langsung di root repo, pilih **`/`**

**Kenapa harus pilih `vaxa-bot/`:**
- Karena `package.json` ada di dalam folder `vaxa-bot/`
- Railway perlu tau dimana `package.json` berada

---

## Step 3: Deploy ke Railway (via Web)
/vaxa-bot     ← Bot ada di subfolder
 或
/             ← Bot di root repository
```

### B. Buat Project di Railway

1. Buka: https://railway.app
2. Klik **"New Project"**
3. Pilih **"Empty Project"**
4. Nama: `vaxa-bot`
5. Klik **"Deploy from GitHub"**
6. Connect GitHub account → Select repo `vaxa-bot`
7. Tunggu deploy selesai

### C. Setting Environment Variables

1. Di Railway dashboard, klik tab **"Variables"**
2. Tambah variabel satu per satu:

| Key | Value |
|-----|-------|
| `TELEGRAM_BOT_TOKEN` | Token dari @BotFather |
| `GITHUB_TOKEN` | Token dari github.com/settings/tokens |
| `VAXA_API_URL` | `https://scbc-hacks.vercel.app` |
| `DAILY_SPEND_LIMIT` | `5.00` (max USDC per user/hari) |

**Opsional - Bot Wallet (untuk payment):**
| Key | Value |
|-----|-------|
| `BOT_USDC_PRIVATE_KEY` | Private key dengan USDC (Fuji) |
| `USDC_CONTRACT_ADDRESS` | `0x5425890C6C9Fc8561a8b4E763b7E6e43b7e9A5F4` |
| `VAXA_API_URL` | `https://scbc-hacks.vercel.app` |

3. Klik **"+ Add"** untuk setiap variabel
4. Klik **"Deploy"** ulang

---

## Step 4: Set Webhook

Setelah deploy selesai:

1. Buka Railway → Settings → **Domains**
2. **COPY** domain URL (contoh: `vaxa-bot.up.railway.app`)
3. Buka browser, akses:

```
https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://vaxa-bot.up.railway.app/webhook
```

Ganti `<TELEGRAM_BOT_TOKEN>` dengan token kamu (tanpa tanda `<>`).

---

## Step 5: Test Bot

Buka Telegram, cari bot kamu (username yang dibuat di Step 1), lalu coba:

```
/start
/help
/agents
/github repo facebook/react
```

---

## Troubleshooting

### Bot tidak merespon?
1. Cek Railway → **Deployments** → Lihat logs
2. Pastikan variables sudah benar
3. Cek Railway → **Domains** - harus ada domain

### GitHub error?
Pastikan GITHUB_TOKEN punya scope `repo`

### Domain tidak muncul?
Klik **"Generate Domain"** di Railway

---

## Quick Reference

| Yang Perlu Disiapin | Link |
|---------------------|------|
| Telegram Token | @BotFather di Telegram |
| GitHub Token | github.com/settings/tokens |
| Railway | railway.app |