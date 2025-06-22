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

### Direct Cloudflare Deployment

#### First Time Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Login to Cloudflare**:
   ```bash
   npx wrangler login
   ```

#### Option 1: Wrangler CLI (Recommended)

1. **Build and Deploy**:
   ```bash
   npm run build
   npm run deploy
   ```

#### Option 2: Manual Steps

1. **Build the project**:
   ```bash
   npm run build
   ```

2. **Deploy to Workers**:
   ```bash
   npx wrangler deploy
   ```


### Environment Configuration

Configure these variables in your Cloudflare Workers dashboard or `wrangler.jsonc`:

```env
# Required
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret

# Optional - PiShock Relay Account
PISHOCK_RELAY_API_KEY=relay_api_key
PISHOCK_RELAY_USERNAME=relay_username
```

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
   npm run dev        # Frontend development (Vite)
   npm run pages:dev  # Full Workers development with backend
   ```

### Project Scripts

- `npm run dev` - Start Vite development server
- `npm run build` - Build project with Pages Functions compilation
- `npm run deploy` - Deploy to Cloudflare Workers
- `npm run pages:dev` - Local Workers development environment
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
   - Set the Activity URL to your Cloudflare Workers domain
   - Add required OAuth2 scopes: `identify`, `guilds`, `guilds.members.read`, `rpc.activities.write`
3. Update environment variables with your Discord Client ID and Secret

### PiShock API

The application uses the PiShock API for device control. Users can configure their API credentials within the application interface.

## Architecture

### Cloudflare Workers

This project uses:
- **Workers**: Server-side logic (compiled from Pages Functions)
- **KV Storage**: User credentials and activity logs
- **Assets**: Static file serving for the React frontend

### API Endpoints

The application provides these API endpoints:

- `POST /api/auth/discord` - Discord OAuth2 token exchange
- `GET/PUT /api/instances/{instanceId}/data` - Instance data management
- `GET/PUT /api/instances/{instanceId}/pishock-settings` - PiShock configuration
- `POST /api/instances/{instanceId}/audit-log` - Audit logging
- `POST /api/pishock/test-connection` - Test PiShock connectivity
- `POST /api/pishock/execute` - Execute PiShock commands
- `GET /api/discord/guilds/{guildId}/members/{userId}` - Guild member data

## Security

- All PiShock credentials are encrypted and stored in Cloudflare KV
- Instance-based data isolation ensures privacy between Discord activities
- Comprehensive audit logging tracks all device interactions
- Safety warnings and consent mechanisms are enforced
- Rate limiting and authentication on all API endpoints

## Deployment Workflow

### Build Process

1. **Frontend Build**: Vite compiles React application
2. **Functions Build**: Wrangler compiles Pages Functions to Workers format
3. **Asset Preparation**: Static files prepared for Workers Assets
4. **Deployment**: Single `wrangler deploy` command

### Version Management

The application includes automatic version checking to ensure all participants use the same version during activities.

## Monitoring

### Cloudflare Dashboard

Monitor your deployment through:
- **Workers & Pages**: Deployment status and logs
- **Analytics**: Request metrics and performance
- **KV**: Data storage usage
- **Logs**: Real-time application logs

### Local Development

Use `npm run pages:dev` for full-featured local development that mirrors the production Workers environment.

## Troubleshooting

### Common Issues

1. **Build Failures**: Ensure Node.js 18+ and all dependencies installed
2. **KV Access**: Verify KV namespace bindings in `wrangler.jsonc`
3. **Environment Variables**: Check Discord credentials are properly set
4. **CORS Issues**: Verify Discord Activity URL matches deployed domain

### Debug Commands

```bash
npx wrangler dev --local                    # Local development
npx wrangler deploy --dry-run              # Validate configuration
npx wrangler kv:namespace list             # List KV namespaces
npx wrangler tail                          # Live logs
```

## License

This project is for educational and consensual use only. Users are responsible for compliance with all applicable laws and regulations.