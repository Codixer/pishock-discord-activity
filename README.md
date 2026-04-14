---

<div align="center">

**⚡ Made with [Bolt.new](https://bolt.new/?rid=u8s05i) ⚡** (AI)

*Get 200K extra credits by using this link! Upgrade to Pro for 5M extra tokens.*

---

</div>

# PiShock Discord Activity

A production-ready Discord Activity application that enables consensual control of PiShock electrical devices in a multiplayer Discord environment. This application provides a safe, transparent, and accountable way for Discord users to interact with PiShock devices through a purpose-built interface with comprehensive safety features and activity logging.

---

## 🚀 Wanna host this yourself? Use the following button!

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Codixer/pishock-discord-activity)

---

## ⚠️ **CRITICAL SAFETY WARNING** ⚠️

**This application controls electrical shock devices that can cause physical harm, injury, or death if misused.**

- **Age Requirement**: You must be 18+ to use this application
- **Explicit Consent**: Only use with explicit, informed consent from all participants
- **Safety First**: Always start with lowest intensity settings and establish safe words
- **Legal Compliance**: Ensure compliance with all local laws and regulations
- **Personal Responsibility**: Users assume all risks and responsibility for safe use

By using this application, you acknowledge that you have read, understood, and agree to be bound by the [Terms of Service](src/components/TermsOfService.tsx) and [Privacy Policy](src/components/PrivacyPolicy.tsx).

---

## Table of Contents

- [Features Overview](#features-overview)
- [Architecture Overview](#architecture-overview)
- [Complete Setup Guide](#complete-setup-guide)
- [User Guide](#user-guide)
- [Development](#development)
- [API Reference](#api-reference)
- [Data Storage & KV Structure](#data-storage--kv-structure)
- [Safety & Security Features](#safety--security-features)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [Legal & Compliance](#legal--compliance)
- [Support & Resources](#support--resources)

---

## Features Overview

### Core Functionality
- **Discord Integration**: Native Discord Activity running in voice channels or DMs
- **Device Control**: Send shock, vibrate, and beep commands to PiShock devices
- **Multiplayer Support**: Multiple users can participate with their own devices
- **Real-time Updates**: Live participant list and activity feed
- **Session Management**: 6-hour session limits with automatic cleanup
- **Picture-in-Picture Mode**: Optimized UI for Discord's PIP layout mode

### Safety & Security Features
- **User-configurable Limits**: Individual max intensity and duration settings
- **Activity Logging**: All actions publicly logged for transparency and accountability
- **Consent Mechanisms**: Explicit safety warnings and acknowledgment required
- **Ban System**: Users can block specific individuals from controlling their devices
- **Encrypted Storage**: All PiShock credentials encrypted with automatic expiration
- **Instance Verification**: Sessions verified against Discord's API for validity
- **Emergency Procedures**: Built-in safety reminders and emergency stop capabilities

### Technical Features
- **Cloudflare Workers**: Serverless backend with global edge deployment
- **Real-time Caching**: Optimized API calls with client-side caching (5-minute TTL) and background polling (10-minute intervals)
- **Responsive Design**: Works seamlessly across desktop, mobile, and Discord's PIP mode
- **Error Handling**: Comprehensive error reporting and graceful failure handling
- **Version Management**: Dynamic build versioning for tracking deployments
- **Content Security Policy**: Nuclear CSP blocking all external scripts and injection

---

## Architecture Overview

```
Discord Client → Discord Activity → Cloudflare Workers → PiShock API
                     ↓
                 KV Storage (user data, activity logs)
                     ↓
                 Instance Management & Verification
```

### Technology Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite
- **Backend**: Cloudflare Workers (Pages Functions), Cloudflare KV
- **Discord Integration**: Discord Embedded App SDK v1.1.0
- **Device API**: PiShock v0 API (`api.pishock.com`)
- **Deployment**: Cloudflare Pages with Workers
- **Build Tools**: Vite 5, TypeScript 5.5, ESLint 9

### Project Structure
```
pishock-discord-activity/
├── functions/                 # Cloudflare Workers (API endpoints)
│   ├── _middleware.ts        # Global middleware
│   └── api/
│       ├── version.ts        # Version endpoint
│       ├── verify-instance.ts # Instance verification
│       ├── instances/        # Instance-specific endpoints
│       └── users/            # User-specific endpoints
├── src/                      # React frontend
│   ├── components/           # React components
│   │   ├── ActivityLog.tsx
│   │   ├── ConnectionStatus.tsx
│   │   ├── NotificationSystem.tsx
│   │   ├── PiShockController.tsx
│   │   ├── PiShockSettingsModal.tsx
│   │   ├── PrivacyPolicy.tsx
│   │   ├── SafetyWarning.tsx
│   │   ├── TermsOfService.tsx
│   │   └── UserSelector.tsx
│   ├── hooks/                # Custom React hooks
│   │   ├── useInstanceData.ts
│   │   ├── useNotifications.ts
│   │   ├── useParticipants.ts
│   │   ├── useUserStatusCache.ts
│   │   └── useVersionCheck.ts
│   ├── App.tsx               # Main application
│   ├── main.tsx              # Entry point
│   └── index.css             # Global styles
├── public/                   # Static assets
├── scripts/                  # Build and deployment scripts
│   ├── deploy-workers.js
│   └── post-build.js
├── _headers                  # Cloudflare Pages headers
├── _redirects                # Cloudflare Pages redirects
├── vite.config.ts            # Vite configuration
├── wrangler.jsonc            # Cloudflare Workers config
├── tailwind.config.js        # Tailwind CSS config
├── tsconfig.json             # TypeScript config
└── package.json              # Dependencies
```

---

## Complete Setup Guide

### Prerequisites

#### Required Accounts & Services
1. **Discord Developer Account** - [Discord Developer Portal](https://discord.com/developers/applications)
2. **Cloudflare Account** - [Cloudflare Dashboard](https://dash.cloudflare.com) (Free tier sufficient)
3. **PiShock Account** - [PiShock Website](https://pishock.com) (users need individual accounts)
4. **Node.js 18+** - [Download Node.js](https://nodejs.org/)

#### Required Knowledge
- Basic understanding of Discord Applications and Activities
- Familiarity with environment variables and command line tools
- Understanding of the safety implications of electrical shock devices
- Basic knowledge of serverless deployment concepts

---

## Step-by-Step Setup Instructions

### Step 1: Discord Application Setup

#### 1.1 Create Discord Application
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and name it (e.g., "PiShock Controller")
3. **Save your Application ID** - you'll need this as `DISCORD_CLIENT_ID`

#### 1.2 Configure OAuth2 Settings
1. In your Discord Application, navigate to **OAuth2 → General**
2. Add these Redirect URIs:
   ```
   https://your-domain.pages.dev/
   https://your-domain.pages.dev/auth/callback
   ```
3. Under **Scopes**, ensure these are available:
   - `identify` - Get user's Discord identity
   - `guilds` - Access to user's Discord servers
   - `guilds.members.read` - Read server member information
   - `rpc.activities.write` - Launch Discord Activities

#### 1.3 Create and Configure Discord Bot
1. Go to **Bot** section in your Discord Application
2. Click "Add Bot" if not already created
3. **Copy the Bot Token** - you'll need this as `DISCORD_BOT_TOKEN`
4. Enable these **Privileged Gateway Intents**:
   - **Server Members Intent** - Required for participant management
   - **Message Content Intent** - Required for activity features

#### 1.4 Configure Discord Activity
1. Go to **Activities** in your Discord Application
2. Click "Add Activity" or configure existing
3. Set the **Activity URL** to: `https://your-domain.pages.dev`
4. Configure **Activity Details**:
   - **Name**: "PiShock Controller"
   - **Description**: "Consensual PiShock device control in Discord"
   - **Tags**: Add relevant tags like "social", "utility"
   - **Age Rating**: Set to 18+ (Required)

---

### Step 2: Repository Setup

#### 2.1 Clone and Install Dependencies
```bash
# Clone the repository
git clone <your-repo-url>
cd pishock-discord-activity

# Install all dependencies
npm install

# Login to Cloudflare (first time setup)
npx wrangler login
```

#### 2.2 Create Cloudflare KV Namespace
```bash
# Create production KV namespace
npx wrangler kv:namespace create "PISHOCK_KV"

# Create preview KV namespace for testing
npx wrangler kv:namespace create "PISHOCK_KV" --preview

# Note down both namespace IDs from the output
```

#### 2.3 Configure wrangler.jsonc
Update the KV namespace IDs in [`wrangler.jsonc`](wrangler.jsonc):
```jsonc
{
  "kv_namespaces": [
    {
      "binding": "PISHOCK_KV",
      "id": "your_production_namespace_id_here",
      "preview_id": "your_preview_namespace_id_here"
    }
  ]
}
```

---

### Step 3: Environment Configuration

#### 3.1 Build-time Variables (Frontend)
Create a `.env` file in the project root:
```env
# Discord Application ID (public, safe for frontend)
VITE_DISCORD_CLIENT_ID=your_discord_application_id_here
```

#### 3.2 Runtime Variables (Backend Functions)

Set these as **encrypted secrets** in Cloudflare. These are sensitive values that must be encrypted.

##### Method 1: Via Wrangler CLI (Recommended)

```bash
# Discord secrets (Required)
npx wrangler secret put DISCORD_BOT_TOKEN
npx wrangler secret put DISCORD_CLIENT_ID
npx wrangler secret put DISCORD_CLIENT_SECRET
npx wrangler secret put VITE_DISCORD_CLIENT_SECRET
```

##### Method 2: Via Cloudflare Dashboard

1. Go to **Workers & Pages** → Your Worker → **Settings** → **Variables**
2. Click **Add Variable**
3. Set **Type** to **Secret** (encrypted)
4. Add each variable:

| Variable | Required | Purpose |
|----------|----------|---------|
| `DISCORD_BOT_TOKEN` | ✅ Yes | Discord bot authentication token |
| `DISCORD_CLIENT_ID` | ✅ Yes | Discord application ID |
| `DISCORD_CLIENT_SECRET` | ✅ Yes | Discord OAuth2 client secret |
| `VITE_DISCORD_CLIENT_SECRET` | ✅ Yes | Discord client secret for frontend OAuth |

**⚠️ Security Notes**:

- Never use `VITE_` prefix for sensitive data like bot tokens or secrets!
- Always use **Secret** type (encrypted) for tokens and secrets, not plain text variables
- Secrets are encrypted at rest and only decrypted in the Worker runtime

---

### Step 4: Build and Deploy

#### 4.1 Build the Application
```bash
# Build with environment variables
npm run build
```

The build process:
1. Compiles React frontend with Vite
2. Builds Cloudflare Workers functions
3. Generates dynamic build version
4. Creates `dist/version.json` with deployment info

#### 4.2 Deploy to Cloudflare Workers
```bash
# Deploy to production
npm run workers:deploy
```

#### 4.3 Automated Deployment (Recommended)
```bash
# Set environment variable and deploy in one command
export DISCORD_CLIENT_ID="your_discord_application_id_here"
npm run deploy:auto
```

---

### Step 5: Final Discord Configuration

#### 5.1 Update Activity URL
In Discord Developer Portal → Your Application → Activities:
1. Update **Activity URL** to your deployed Cloudflare domain:
   ```
   https://your-project-name.pages.dev
   ```

#### 5.2 Test the Activity
1. Go to a Discord voice channel or DM
2. Click the Activities button (rocket ship icon)
3. Your "PiShock Controller" should appear in the list
4. Click to launch and verify functionality

---

## User Guide

### For End Users

#### Initial Setup
1. **Join a Discord Activity**: Click Activities in a voice channel and select "PiShock Controller"
2. **Accept Safety Warnings**: Read and acknowledge all safety requirements (see [`SafetyWarning.tsx`](src/components/SafetyWarning.tsx))
3. **Configure PiShock Credentials**:
   - Click the "PiShock Settings" button (see [`PiShockSettingsModal.tsx`](src/components/PiShockSettingsModal.tsx))
   - Enter your PiShock API key, username, and share code
   - Set your maximum intensity (1-100%) and duration (1-15s) limits
   - Test the connection to verify everything works

#### Using the Application
1. **Select Target**: Choose another participant with a configured PiShock device (see [`UserSelector.tsx`](src/components/UserSelector.tsx))
2. **Adjust Settings**: Set intensity (1-100%) and duration (1-15s)
3. **Send Commands**: Use Shock, Vibrate, or Beep buttons (see [`PiShockController.tsx`](src/components/PiShockController.tsx))
4. **Monitor Activity**: All actions are logged in the activity feed (see [`ActivityLog.tsx`](src/components/ActivityLog.tsx))
5. **Safety Management**: Use ban system to block unwanted users

#### Safety Features
- **Activity Logging**: All device commands are publicly visible
- **User Limits**: Set your own maximum intensity and duration
- **Ban System**: Block specific users from controlling your device
- **Session Timeouts**: Maximum 6-hour session duration
- **Emergency Procedures**: Establish safe words before use

---

## Development

### Local Development Setup
```bash
# Install dependencies
npm install

# Start development server (frontend only)
npm run dev

# Start full development environment (frontend + workers)
npm run workers:dev
```

The development server runs at `http://localhost:3000` with hot module replacement.

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run workers:deploy` | Deploy to Cloudflare Workers |
| `npm run deploy` | Build and deploy |
| `npm run deploy:auto` | Automated deployment with env vars |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint issues |
| `npm run preview` | Preview production build |
| `npm run type-check` | TypeScript type checking |

### Development vs Production

| Environment | Data Source | Authentication | Limitations |
|-------------|-------------|----------------|-------------|
| **Development** | Mock data | Simulated | No real PiShock control |
| **Production** | Discord API | OAuth2 | Full functionality |

See [`App.tsx`](src/App.tsx) lines 438-475 for development mode implementation.

### Environment Variables Reference

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `VITE_DISCORD_CLIENT_ID` | Build | Yes | Discord Application ID (public) |
| `DISCORD_BOT_TOKEN` | Runtime Secret | Yes | Discord Bot Token (sensitive) |
| `DISCORD_CLIENT_ID` | Runtime Secret | Yes | Discord Application ID (sensitive) |
| `DISCORD_CLIENT_SECRET` | Runtime Secret | Yes | Discord OAuth2 client secret (sensitive) |
| `VITE_DISCORD_CLIENT_SECRET` | Runtime Secret | Yes | Discord client secret for frontend OAuth (sensitive) |

**Note**: Runtime secrets must be set using `npx wrangler secret put <VAR_NAME>` or via Cloudflare Dashboard as encrypted secrets.

---

## API Reference

### Public Endpoints
- `GET /api/version` - Application version information (see [`functions/api/version.ts`](functions/api/version.ts))
- `GET /api/verify-instance` - Discord instance validation (see [`functions/api/verify-instance.ts`](functions/api/verify-instance.ts))

### Authenticated Endpoints
All require Discord OAuth2 Bearer token in Authorization header.

#### User Management
- `GET /api/users/{userId}/pishock-status` - Get user's PiShock connection status
- `GET /api/users/{userId}/pishock-settings` - Get user's PiShock settings
- `PUT /api/users/{userId}/pishock-settings` - Update user's PiShock settings
- `DELETE /api/users/{userId}/pishock-settings` - Remove user's PiShock credentials
- `POST /api/users/{userId}/pishock-test` - Test user's PiShock connection
- `POST /api/users/{userId}/pishock-execute` - Execute PiShock command (see [`functions/api/users/[userId]/pishock-execute.ts`](functions/api/users/[userId]/pishock-execute.ts))

#### Instance Management
- `GET /api/instances/{instanceId}/status` - Get instance status
- `PUT /api/instances/{instanceId}/status` - Update instance status
- `GET /api/instances/{instanceId}/data` - Get instance data
- `PUT /api/instances/{instanceId}/data` - Update instance data
- `POST /api/instances/{instanceId}/pishock-execute` - Execute command (instance-scoped) (see [`functions/api/instances/[instanceId]/pishock-execute.ts`](functions/api/instances/[instanceId]/pishock-execute.ts))

#### Activity & Logging
- `GET /api/instances/{instanceId}/activity-log` - Retrieve activity history
- `POST /api/activity-log/batch` - Batch activity log processing

#### Discord Integration
- `POST /api/oauth2/token` - Discord OAuth2 token exchange
- `GET /api/discord/user` - Get Discord user information

---

## Data Storage & KV Structure

### Cloudflare KV Namespaces
All data stored in Cloudflare KV with automatic expiration (see [`wrangler.jsonc`](wrangler.jsonc)):

#### User Data
```typescript
// Key: user:{userId}:pishock
{
  apiKey: string;      // Encrypted
  username: string;    // Encrypted
  sharecode: string;   // Encrypted
  maxIntensity: number;
  maxDuration: number;
  bannedUsers: string[];
  expiration: TTL      // 6 hours
}
```

#### Instance Data
```typescript
// Key: instance:{instanceId}:status
{
  instance_id: string;
  application_id: string;
  participant_count: number;
  discord_verified: boolean;
  location: string;
  expiration: TTL      // 6 hours
}
```

#### Activity Logs
```typescript
// Key: activity:batch:{date}
{
  entries: ActivityLogEntry[];  // Up to 5,000 entries
  expiration: TTL                // Auto-purged after several months
}

interface ActivityLogEntry {
  id: string;
  timestamp: string;
  instanceId: string;
  executorUserId: string;
  executorUsername: string;
  executorAvatar?: string;
  targetUserId: string;
  targetUsername: string;
  targetAvatar?: string;
  action: 'shock' | 'vibrate' | 'beep';
  intensity: number;
  duration: number;
  guildId?: string;
  guildName?: string;
}
```

See [`functions/api/instances/[instanceId]/pishock-execute.ts`](functions/api/instances/[instanceId]/pishock-execute.ts) for interface definitions.

#### Session Tokens
```typescript
// Key: discord:token:{userId}
{
  access_token: string;
  refresh_token: string;
  expires_at: number;
}
```

---

## Safety & Security Features

### Built-in Safety Mechanisms
- **User-configurable Limits**: Each user sets max intensity (1-100%) and duration (1-15s)
- **Activity Logging**: All commands publicly logged with full details
- **Ban System**: Users can block specific individuals
- **Session Timeouts**: Maximum 6-hour session duration
- **Explicit Consent**: Safety warnings required before use (see [`SafetyWarning.tsx`](src/components/SafetyWarning.tsx))
- **Emergency Procedures**: Built-in safety reminders

### Data Protection
- **Encryption**: All PiShock credentials encrypted with base64 (minimum)
- **Automatic Expiration**: User data expires after 6 hours of inactivity
- **Access Control**: OAuth2-based authentication required
- **No Third-party Sharing**: Data only shared with Discord and PiShock APIs
- **Privacy Policy**: See [`PrivacyPolicy.tsx`](src/components/PrivacyPolicy.tsx)

### Security Headers
The application implements comprehensive security headers (see [`_headers`](_headers)):
- **CSP**: Strict Content Security Policy blocking external scripts and inline execution
- **Cloudflare Features**: All analytics and optimization features disabled
- **CORS**: Proper CORS headers for API endpoints
- **Cache Control**: Appropriate caching policies for different content types
- **X-Frame-Options**: Prevents clickjacking
- **X-Content-Type-Options**: Prevents MIME sniffing

From [`index.html`](index.html):
```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-eval' blob:; script-src-elem 'self' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cdn.discordapp.com; connect-src 'self' https://discord.com https://api.pishock.com; font-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests; block-all-mixed-content">
```

---

## Troubleshooting

### Common Issues

#### "Invalid Session" Error
**Cause**: Instance not found in Discord or expired (6+ hours)
**Solution**: Start a new Discord Activity session

#### "No Discord Client ID" Error  
**Cause**: Missing or incorrect `VITE_DISCORD_CLIENT_ID`
**Solution**: Set the environment variable and rebuild:
```bash
export DISCORD_CLIENT_ID="your_application_id"
npm run deploy:auto
```

#### PiShock Connection Failed
**Cause**: Invalid API credentials or device offline
**Solution**: 
1. Verify PiShock credentials in account settings
2. Ensure device is online and connected
3. Check share code is correct and not expired
4. Test connection using the built-in test feature (see [`PiShockSettingsModal.tsx`](src/components/PiShockSettingsModal.tsx))

#### Workers Deployment Failed
**Cause**: Missing KV namespace or incorrect configuration
**Solution**:
1. Verify KV namespace IDs in [`wrangler.jsonc`](wrangler.jsonc)
2. Ensure Cloudflare account has Workers access
3. Check environment variables are set correctly
4. Run `npx wrangler login` to re-authenticate

#### "Failed to Load Activity Log"
**Cause**: KV storage issues or network problems
**Solution**:
1. Check Cloudflare KV namespace configuration
2. Verify API endpoints are accessible
3. Clear browser cache and reload

#### Discord Activity Not Appearing
**Cause**: Incorrect Activity URL or Discord application misconfiguration
**Solution**:
1. Verify Activity URL matches deployed domain
2. Check Discord application OAuth2 settings
3. Ensure bot token is correctly configured
4. Verify all required Discord permissions are granted

### Debug Commands
```bash
# Check environment variables
echo $DISCORD_CLIENT_ID

# Validate wrangler configuration
npx wrangler deploy --dry-run

# View worker logs
npx wrangler tail

# List KV namespaces
npx wrangler kv:namespace list

# Check KV data
npx wrangler kv:key list --namespace-id="your_namespace_id"
```

### Performance Optimization
- **Client-side Caching**: User status cached for 1 minute (see [`useUserStatusCache.ts`](src/hooks/useUserStatusCache.ts))
- **Batch Processing**: Activity logs stored in daily batches
- **Optimized API Calls**: Status checks reduced to 10-minute intervals (see [`App.tsx`](src/App.tsx) lines 576-590)
- **CDN**: Static assets served via Cloudflare CDN

---

## Contributing

### Development Guidelines
- **Safety First**: All changes must maintain or improve safety features
- **Security**: No bypassing of safety mechanisms or security measures
- **Testing**: Thorough testing required for device control features
- **Documentation**: Update documentation for any API or feature changes

### Code Standards
- **TypeScript**: Strict TypeScript configuration required ([`tsconfig.json`](tsconfig.json))
- **ESLint**: Code must pass all linting rules ([`eslint.config.js`](eslint.config.js))
- **File Organization**: Maximum 300 lines per file, modular architecture
- **Error Handling**: Comprehensive error handling for all operations

### Pull Request Requirements
See [`.github/pull_request_template.md`](.github/pull_request_template.md):
- [ ] All safety mechanisms intact
- [ ] Comprehensive testing completed
- [ ] Documentation updated
- [ ] ESLint passes
- [ ] TypeScript compilation successful
- [ ] No security vulnerabilities introduced

---

## Legal & Compliance

### Terms of Service
See [`TermsOfService.tsx`](src/components/TermsOfService.tsx):
- This application is provided for educational and consensual adult use only
- Users must be 18+ years of age
- Explicit consent required from all participants
- Users assume all risks and responsibility for safe use
- Must comply with all applicable local laws and regulations

### Liability Disclaimer
- Developers assume no responsibility for harm, injury, or misuse
- Users are solely responsible for safe operation of electrical devices
- Application provided "as-is" without warranties
- See full Terms of Service and Privacy Policy in application

### Safety Requirements
- Always start with lowest intensity settings
- Establish safe words and emergency procedures
- Never use with individuals who have medical conditions or devices
- Avoid sensitive body areas and follow PiShock safety guidelines
- Monitor all participants for consent and comfort

### Data Privacy
See [`PrivacyPolicy.tsx`](src/components/PrivacyPolicy.tsx):
- All data stored in compliance with international standards
- Users have full control over their stored credentials
- Activity logs maintained for safety and accountability
- No sharing of user data with unauthorized third parties

---

## Support & Resources

### Getting Help
1. **Documentation**: Review this comprehensive guide first
2. **Troubleshooting**: Check the troubleshooting section for common issues
3. **Safety Issues**: For safety emergencies, discontinue use immediately
4. **Technical Issues**: Verify configuration and check debug commands

### Useful Links
- [Discord Developer Documentation](https://discord.com/developers/docs/activities/overview)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [PiShock API Documentation](https://api.pishock.com/swagger/v0/swagger.json)
- [Discord Activities SDK](https://github.com/discord/embedded-app-sdk)

### Community Guidelines
- Prioritize safety in all discussions and usage
- Respect user consent and privacy
- Follow responsible disclosure for security issues
- Maintain transparency in all application functions

---

## Version History & Updates

### Current Version
- **Build Version**: Dynamic based on deployment timestamp (see [`vite.config.ts`](vite.config.ts))
- **Last Updated**: Continuous deployment from main branch
- **Compatibility**: Discord SDK v1.1.0+, Node.js 18+

### Update Mechanism
- **Automatic Checks**: Version verification on session start (see [`useVersionCheck.ts`](src/hooks/useVersionCheck.ts))
- **Graceful Updates**: Users notified of new versions
- **Session Management**: Active sessions gracefully terminated for updates

---

## Advanced Configuration

### Custom Deployment
For advanced users deploying their own instance:

```bash
# Custom domain deployment
wrangler pages deploy dist --project-name=your-custom-name

# Environment-specific deployment
DISCORD_CLIENT_ID="custom_id" npm run deploy:auto

# Preview deployment
npx wrangler pages deploy dist --compatibility-date=2024-01-15
```

### Monitoring & Analytics
- **Worker Logs**: Available through Cloudflare dashboard
- **KV Metrics**: Monitor storage usage and performance
- **Error Tracking**: Built-in error reporting and handling (see [`NotificationSystem.tsx`](src/components/NotificationSystem.tsx))

### Security Hardening
- **CSP Configuration**: Modify [`_headers`](_headers) file for stricter policies
- **Rate Limiting**: Implement additional rate limiting if needed
- **Custom Encryption**: Replace base64 with stronger encryption in [`functions/api/instances/[instanceId]/pishock-execute.ts`](functions/api/instances/[instanceId]/pishock-execute.ts)

---

## Quick Start Checklist

- [ ] Discord Application created with correct OAuth2 settings
- [ ] Discord Bot created with required privileged intents
- [ ] Cloudflare account set up with KV namespaces created
- [ ] Build-time environment variable configured (`VITE_DISCORD_CLIENT_ID`)
- [ ] Runtime secrets configured via Wrangler CLI or Dashboard:
  - [ ] `DISCORD_BOT_TOKEN` set as encrypted secret
  - [ ] `DISCORD_CLIENT_ID` set as encrypted secret
  - [ ] `DISCORD_CLIENT_SECRET` set as encrypted secret
  - [ ] `VITE_DISCORD_CLIENT_SECRET` set as encrypted secret
- [ ] Application built and deployed to Cloudflare Workers
- [ ] Discord Activity URL updated to deployed domain
- [ ] Application tested in Discord voice channel
- [ ] Safety warnings and terms reviewed and understood
- [ ] PiShock credentials configured and tested
- [ ] Emergency procedures established before first use

---

**Remember: Safety is paramount. This application controls electrical devices. Always prioritize user safety, consent, and legal compliance in all usage and development.**

---

## License

This project is provided for educational purposes. Users are responsible for ensuring compliance with all applicable laws and regulations in their jurisdiction.

## Acknowledgments

- Built with [Bolt.new](https://bolt.new) AI assistance
- Powered by Discord's Embedded App SDK
- Hosted on Cloudflare Workers
- Uses PiShock API for device control

---

For questions, issues, or contributions, please ensure all safety protocols are followed and refer to the comprehensive documentation above.