# PiShock Discord Activity

A Discord Activity application for controlling PiShock devices in a multiplayer environment.

## Features

- Discord Activity integration with multiplayer support
- Real-time participant management
- PiShock device control (shock, vibrate, beep)
- Instance-based data persistence
- Safety warnings and consent mechanisms
- Audit logging for all actions

## Development

### Prerequisites

- Node.js 18+
- Discord Application with Activity configured
- Cloudflare account with Pages and KV namespace

### Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

### Cloudflare Pages Deployment

1. Install Wrangler CLI:
   ```bash
   npm install -g wrangler
   ```

2. Login to Cloudflare:
   ```bash
   wrangler login
   ```

3. Create a KV namespace:
   ```bash
   wrangler kv:namespace create "PISHOCK_KV"
   wrangler kv:namespace create "PISHOCK_KV" --preview
   ```

4. Update `wrangler.toml` with your KV namespace IDs

5. Set environment variables in Cloudflare Pages dashboard:
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
   - `DISCORD_REDIRECT_URI`
   - `PISHOCK_API_URL`

6. Build and deploy:
   ```bash
   npm run build
   npm run pages:deploy
   ```

### Configuration

#### Discord Application Setup

1. Create a Discord Application at https://discord.com/developers/applications
2. Configure the Activity:
   - Set the Activity URL to your Cloudflare Pages domain
   - Add required OAuth2 scopes: `identify`, `guilds`, `guilds.members.read`, `rpc.activities.write`
3. Update environment variables with your Discord Client ID and Secret

#### PiShock API

The application uses the PiShock API for device control. Users can configure their API credentials within the application interface.

## Security

- All PiShock credentials are stored securely in Cloudflare KV
- Instance-based data isolation ensures privacy between different Discord activities
- Comprehensive audit logging tracks all device interactions
- Safety warnings and consent mechanisms are enforced

## API Endpoints

The application expects the following API endpoints to be available:

- `POST /api/auth/discord` - Discord OAuth2 token exchange
- `GET/PUT /api/instances/{instanceId}/data` - Instance data management
- `GET/PUT /api/instances/{instanceId}/pishock-settings` - PiShock configuration
- `POST /api/instances/{instanceId}/audit-log` - Audit logging
- `POST /api/pishock/test-connection` - Test PiShock connectivity
- `POST /api/pishock/execute` - Execute PiShock commands
- `GET /api/discord/guilds/{guildId}/members/{userId}` - Guild member data

## License

This project is for educational and consensual use only. Users are responsible for compliance with all applicable laws and regulations.