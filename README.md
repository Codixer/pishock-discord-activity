# PiShock Discord Activity (Cloudflare Workers)

A Discord Activity application for controlling PiShock devices in a multiplayer environment, deployed on Cloudflare Workers.

## Features

- Discord Activity integration with multiplayer support
- Real-time participant management
- PiShock device control (shock, vibrate, beep)
- Instance-based data persistence
- Safety warnings and consent mechanisms
- Audit logging for all actions

## 🚀 Deployment (Cloudflare Workers)

This project deploys directly to Cloudflare Workers using Wrangler CLI.

### Prerequisites

- Node.js 18+
- Discord Application with Activity configured
- Cloudflare account with Workers and KV namespace
- Wrangler CLI (included in devDependencies)

### Environment Variable Setup for Workers

**Option 1: Set in Workers Dashboard (Recommended)**

1. **Go to Cloudflare Workers Dashboard**:
   - Navigate to `Workers & Pages` → Your worker → `Settings` → `Variables and Secrets`

2. **Add Environment Variables**:
   ```
   DISCORD_CLIENT_SECRET = your_discord_client_secret
   PISHOCK_RELAY_API_KEY = your_relay_api_key (optional)
   PISHOCK_RELAY_USERNAME = your_relay_username (optional)
   ```

3. **For build-time variables**, you have two options:

**Option 2A: Deploy with Environment Variables**

```bash
# Set your Discord Client ID as environment variable locally
export DISCORD_CLIENT_ID="your_actual_discord_client_id"

# Deploy with the variable
npm run deploy:with-env
```

**Option 2B: Use Local .env File**

```bash
# Create .env file
echo "VITE_DISCORD_CLIENT_ID=your_actual_discord_client_id" > .env

# Build locally (picks up .env)
npm run build

# Deploy the built version
npm run workers:deploy
```

### Direct Cloudflare Workers Deployment

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Login to Cloudflare**:
   ```bash
   npx wrangler login
   ```

3. **Deploy with environment variables**:
   ```bash
   # Method 1: Set locally and deploy
   export DISCORD_CLIENT_ID="1234567890123456789"
   npm run deploy:with-env
   
   # Method 2: Use .env file
   echo "VITE_DISCORD_CLIENT_ID=1234567890123456789" > .env
   npm run deploy
   ```

### Verify Environment Variables

After deployment, check the browser console:

```javascript
// Should show your actual Discord Client ID
Environment check: {
  client_id: "1234567890123456789", // ✅ Your real ID
  env_keys: ["VITE_DISCORD_CLIENT_ID"] // ✅ Variable found
}
```

### Worker Environment Variables vs Build Variables

| Variable Type | Purpose | Set Where | When Available |
|---------------|---------|-----------|----------------|
| `VITE_*` | Build-time (React app) | Local `.env` or deploy command | Build time only |
| Regular vars | Runtime (Worker functions) | Workers Dashboard or `wrangler.jsonc` | Runtime only |

## Development

### Local Development

1. **Clone and install**:
   ```bash
   git clone <repository>
   cd pishock-discord-activity
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your Discord credentials
   ```

3. **Start development servers**:
   ```bash
   npm run dev          # Frontend development (Vite)
   npm run workers:dev  # Full Workers development with backend
   ```

### Project Scripts

- `npm run dev` - Start Vite development server
- `npm run build` - Build project with Pages Functions compilation
- `npm run deploy` - Build and deploy to Cloudflare Workers
- `npm run deploy:with-env` - Deploy with environment variables from shell
- `npm run workers:dev` - Local Workers development environment
- `npm run workers:deploy` - Deploy to Workers (build first)
- `npm run lint` - Run ESLint
- `npm run type-check` - TypeScript type checking

### KV Namespace Setup

The KV namespace is configured in `wrangler.jsonc`. To create a new one:

```bash
npx wrangler kv:namespace create "PISHOCK_KV"
npx wrangler kv:namespace create "PISHOCK_KV" --preview
```

Update the namespace IDs in `wrangler.jsonc` with the returned values.

## Configuration

### Discord Application Setup

1. Create a Discord Application at https://discord.com/developers/applications
2. Configure the Activity:
   - Set the Activity URL to your Cloudflare Worker domain
   - Add required OAuth2 scopes: `identify`, `guilds`, `guilds.members.read`, `rpc.activities.write`
3. Set your Discord Client ID in environment variables for deployment

### Worker Environment Variables

Set these in Cloudflare Workers Dashboard → Settings → Variables and Secrets:

```
DISCORD_CLIENT_SECRET = your_discord_client_secret_here
PISHOCK_RELAY_API_KEY = your_relay_api_key (optional)
PISHOCK_RELAY_USERNAME = your_relay_username (optional)
```

## Architecture

### Cloudflare Workers

This project uses:
- **Workers**: Server-side logic (compiled from Pages Functions)
- **KV Storage**: User credentials and activity logs
- **Assets**: Static file serving for the React frontend

### API Endpoints

- `POST /api/auth/discord` - Discord OAuth2 token exchange
- `GET/PUT /api/instances/{instanceId}/data` - Instance data management
- `GET/PUT /api/instances/{instanceId}/pishock-settings` - PiShock configuration
- `POST /api/activity-log` - Activity logging
- `POST /api/users/{userId}/pishock-execute` - Execute PiShock commands
- `GET /api/discord/guilds/{guildId}/members/{userId}` - Guild member data

## Deployment Examples

### Example 1: Simple Deployment

```bash
# Set environment variable locally
export DISCORD_CLIENT_ID="1234567890123456789"

# Deploy with the variable
npm run deploy:with-env
```

### Example 2: Using .env File

```bash
# Create .env file
cat > .env << EOF
VITE_DISCORD_CLIENT_ID=1234567890123456789
EOF

# Build and deploy
npm run deploy
```

### Example 3: CI/CD Pipeline

```bash
# In your CI/CD pipeline
wrangler deploy --var VITE_DISCORD_CLIENT_ID:$DISCORD_CLIENT_ID
```

## Troubleshooting

### Environment Variable Issues

**Problem**: `client_id: undefined`

**Solutions**:

1. **Check your build environment**:
   ```bash
   # Verify the variable is set
   echo $DISCORD_CLIENT_ID
   
   # Or create .env file
   echo "VITE_DISCORD_CLIENT_ID=your_id_here" > .env
   ```

2. **Use the deploy command with variables**:
   ```bash
   npm run deploy:with-env
   ```

3. **Check Workers Dashboard**:
   - Go to your worker → Settings → Variables and Secrets
   - Ensure runtime variables are set for the Worker functions

### Debug Commands

```bash
npx wrangler dev --local                    # Local development
npx wrangler deploy --dry-run              # Validate configuration
npx wrangler kv:namespace list             # List KV namespaces
npx wrangler tail                          # Live logs
```

## Security

- All PiShock credentials are encrypted and stored in Cloudflare KV
- Instance-based data isolation ensures privacy between Discord activities
- Comprehensive audit logging tracks all device interactions
- Safety warnings and consent mechanisms are enforced
- Rate limiting and authentication on all API endpoints

## License

This project is for educational and consensual use only. Users are responsible for compliance with all applicable laws and regulations.