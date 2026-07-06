# Secrets Setup Guide

This guide walks you through setting up all required encrypted secrets for the PiShock Discord Activity application.

## Overview

All sensitive credentials must be stored as **encrypted secrets** in Cloudflare Workers. These are NOT stored in files or environment variables that can be committed to git.

## Required Secrets

### Discord Secrets (All Required)

| Secret Name | Description | Where to Get It |
|-------------|-------------|-----------------|
| `DISCORD_BOT_TOKEN` | Bot authentication token | Discord Developer Portal → Your App → Bot → Token |
| `DISCORD_CLIENT_ID` | Discord application ID | Discord Developer Portal → Your App → Application ID |
| `DISCORD_CLIENT_SECRET` | OAuth2 client secret | Discord Developer Portal → Your App → OAuth2 → Client Secret |
| `VITE_DISCORD_CLIENT_SECRET` | Client secret for frontend OAuth | Same as above |

## Setup Methods

### Method 1: Wrangler CLI (Recommended)

Run these commands in your terminal:

```bash
# Navigate to your project directory
cd d:\dev\pishock-discord-activity

# Set Discord secrets (ALL REQUIRED)
npx wrangler secret put DISCORD_BOT_TOKEN
# Paste your bot token when prompted

npx wrangler secret put DISCORD_CLIENT_ID
# Paste your Discord application ID when prompted

npx wrangler secret put DISCORD_CLIENT_SECRET
# Paste your OAuth2 client secret when prompted

npx wrangler secret put VITE_DISCORD_CLIENT_SECRET
# Paste your OAuth2 client secret when prompted (same as above)
```

### Method 2: Cloudflare Dashboard (Alternative)

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to **Workers & Pages**
3. Select your worker: `pishock-discord-activity`
4. Click **Settings** → **Variables**
5. Click **Add Variable** button
6. For each secret:
   - **Variable name**: Enter the exact secret name (e.g., `DISCORD_BOT_TOKEN`)
   - **Type**: Select **Secret** (this ensures encryption)
   - **Value**: Paste the secret value
   - Click **Add variable**

Repeat for all secrets listed above.

## Verification

### Check if secrets are set (CLI)

```bash
# List all secrets (shows names only, not values)
npx wrangler secret list
```

Expected output should show:

```text
DISCORD_BOT_TOKEN
DISCORD_CLIENT_ID
DISCORD_CLIENT_SECRET
VITE_DISCORD_CLIENT_SECRET
```

### Check via Dashboard

1. Go to **Workers & Pages** → `pishock-discord-activity` → **Settings** → **Variables**
2. Look under **Environment Variables** → **Secret** section
3. You should see all your secrets listed (values will be encrypted/hidden)

## Getting Secret Values

### Discord Secrets

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Get the values:

   **DISCORD_CLIENT_ID**:
   - Go to **General Information**
   - Copy the **Application ID**

   **DISCORD_BOT_TOKEN**:
   - Go to **Bot** section
   - Click **Reset Token** (if needed)
   - Copy the token (save it immediately - it's only shown once!)

   **DISCORD_CLIENT_SECRET**:
   - Go to **OAuth2** → **General**
   - Copy the **Client Secret** (or reset if needed)

   **VITE_DISCORD_CLIENT_SECRET**:
   - Use the same value as `DISCORD_CLIENT_SECRET`

## Security Best Practices

✅ **DO:**

- Use `npx wrangler secret put` for sensitive values
- Set Type to **Secret** in Cloudflare Dashboard
- Keep secret values in password manager
- Rotate secrets periodically
- Use different values for development/production if possible

❌ **DON'T:**

- Store secrets in `.env` files that get committed to git
- Use VITE_ prefix for sensitive data (it exposes to frontend)
- Share secrets in chat, email, or documentation
- Reuse the same tokens across multiple projects
- Store secrets in plain text files

## Troubleshooting

### "Secret not found" error during deployment

**Solution**: Make sure you've set all required secrets using one of the methods above.

### Can't remember if a secret is set

**Solution**: Run `npx wrangler secret list` to see all secret names (values remain encrypted).

### Need to update a secret value

**Solution**: Run the same command again:

```bash
npx wrangler secret put SECRET_NAME
```

This will overwrite the existing value.

### Need to delete a secret

**Solution**:

```bash
npx wrangler secret delete SECRET_NAME
```

## Next Steps

After setting up all secrets:

1. ✅ Verify secrets are set: `npx wrangler secret list`
2. ✅ Build the application: `npm run build`
3. ✅ Deploy to Cloudflare: `npm run workers:deploy`
4. ✅ Test the Discord Activity in a voice channel

---

**Need help?** Refer to the main [README.md](README.md) for complete setup instructions.

