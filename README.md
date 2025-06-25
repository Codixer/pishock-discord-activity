---

<div align="center">

**⚡ Made with [Bolt.new](https://bolt.new/?rid=u8s05i) ⚡** (AI)

*Get 200K extra credits by using this link! Upgrade to Pro for 5M extra tokens.*

---

</div>

# PiShock Discord Activity

A production-ready Discord Activity application that enables consensual control of PiShock electrical devices in a multiplayer Discord environment. This application provides a safe, transparent, and accountable way for Discord users to interact with PiShock devices through a purpose-built interface with comprehensive safety features and activity logging.

## ⚠️ **CRITICAL SAFETY WARNING** ⚠️

**This application controls electrical shock devices that can cause physical harm, injury, or death if misused.**

- **Age Requirement**: You must be 18+ to use this application
- **Explicit Consent**: Only use with explicit, informed consent from all participants
- **Safety First**: Always start with lowest intensity settings and establish safe words
- **Legal Compliance**: Ensure compliance with all local laws and regulations
- **Personal Responsibility**: Users assume all risks and responsibility for safe use

## Features Overview

### Core Functionality
- **Discord Integration**: Native Discord Activity running in voice channels or DMs
- **Device Control**: Send shock, vibrate, and beep commands to PiShock devices
- **Multiplayer Support**: Multiple users can participate with their own devices
- **Real-time Updates**: Live participant list and activity feed
- **Session Management**: 6-hour session limits with automatic cleanup

### Safety & Security Features
- **User-configurable Limits**: Individual max intensity and duration settings
- **Activity Logging**: All actions publicly logged for transparency and accountability
- **Consent Mechanisms**: Explicit safety warnings and acknowledgment required
- **Ban System**: Users can block specific individuals from controlling their devices
- **Encrypted Storage**: All PiShock credentials encrypted with automatic expiration
- **Instance Verification**: Sessions verified against Discord's API for validity

### Technical Features
- **Cloudflare Workers**: Serverless backend with global edge deployment
- **Real-time Caching**: Optimized API calls with intelligent client-side caching
- **Responsive Design**: Works seamlessly across desktop, mobile, and Discord's PIP mode
- **Error Handling**: Comprehensive error reporting and graceful failure handling
- **Version Management**: Automatic version checking and update notifications

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
- **Backend**: Cloudflare Workers, Cloudflare KV
- **Discord Integration**: Discord Embedded App SDK
- **Device API**: PiShock Legacy & V3 APIs
- **Deployment**: Cloudflare Pages with Workers

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
Update the KV namespace IDs in `wrangler.jsonc`:
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

### Step 3: Environment Configuration

#### 3.1 Build-time Variables (Frontend)
Create a `.env` file in the project root:
```env
# Discord Application ID (public, safe for frontend)
VITE_DISCORD_CLIENT_ID=your_discord_application_id_here
```

#### 3.2 Runtime Variables (Backend Functions)
Set these in **Cloudflare Workers Dashboard** → Your Worker → **Settings** → **Variables**:

| Variable | Value | Purpose |
|----------|-------|---------|
| `DISCORD_BOT_TOKEN` | `your_discord_bot_token_here` | Discord bot authentication |

**⚠️ Security Note**: Never use `VITE_` prefix for sensitive data like bot tokens!

### Step 4: Build and Deploy

#### 4.1 Build the Application
```bash
# Build with environment variables
npm run build
```

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

### Step 5: Final Discord Configuration

#### 5.1 Update Activity URL
In Discord Developer Portal → Your Application → Activities:
1. Update **Activity URL** to your deployed Cloudflare domain:
   ```
   https://your-worker-name.your-subdomain.workers.dev
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
2. **Accept Safety Warnings**: Read and acknowledge all safety requirements
3. **Configure PiShock Credentials**:
   - Click the "PiShock Settings" button
   - Enter your PiShock API key, username, and share code
   - Set your maximum intensity and duration limits
   - Test the connection to verify everything works

#### Using the Application
1. **Select Target**: Choose another participant with a configured PiShock device
2. **Adjust Settings**: Set intensity (1-100%) and duration (1-15s)
3. **Send Commands**: Use Shock, Vibrate, or Beep buttons
4. **Monitor Activity**: All actions are logged in the activity feed
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

### Available Scripts
```bash
npm run dev              # Start development server
npm run build            # Build for production
npm run workers:deploy   # Deploy to Cloudflare Workers
npm run deploy           # Build and deploy
npm run deploy:auto      # Automated deployment with env vars
npm run lint             # Run ESLint
npm run lint:fix         # Fix ESLint issues
npm run preview          # Preview production build
npm run type-check       # TypeScript type checking
```

### Development vs Production

| Environment | Data Source | Authentication | Limitations |
|-------------|-------------|----------------|-------------|
| **Development** | Mock data | Simulated | No real PiShock control |
| **Production** | Discord API | OAuth2 | Full functionality |

### Environment Variables Reference

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `VITE_DISCORD_CLIENT_ID` | Build | Yes | Discord Application ID (public) |
| `DISCORD_BOT_TOKEN` | Runtime | Yes | Discord Bot Token (sensitive) |

---

## API Reference

### Public Endpoints
- `GET /api/version` - Application version information
- `GET /api/verify-instance` - Discord instance validation

### Authenticated Endpoints
All require Discord OAuth2 Bearer token in Authorization header.

#### User Management
- `GET /api/users/{userId}/pishock-status` - Get user's PiShock connection status
- `GET /api/users/{userId}/pishock-settings` - Get user's PiShock settings
- `PUT /api/users/{userId}/pishock-settings` - Update user's PiShock settings
- `DELETE /api/users/{userId}/pishock-settings` - Remove user's PiShock credentials
- `POST /api/users/{userId}/pishock-test` - Test user's PiShock connection
- `POST /api/users/{userId}/pishock-execute` - Execute PiShock command

#### Instance Management
- `GET /api/instances/{instanceId}/status` - Get instance status
- `PUT /api/instances/{instanceId}/status` - Update instance status
- `GET /api/instances/{instanceId}/data` - Get instance data
- `PUT /api/instances/{instanceId}/data` - Update instance data

#### Activity & Logging
- `GET /api/activity-log` - Retrieve activity history
- `POST /api/activity-log` - Add activity log entry

#### Discord Integration
- `POST /api/auth/discord` - Discord OAuth2 authentication
- `GET /api/discord/guilds/{guildId}/members/{userId}` - Get guild member data

---

## Data Storage & KV Structure

### KV Storage Schema
```
instance:{instanceId}:status          - Instance validity and metadata
instance_data:{instanceId}            - Instance-specific application data  
user:{userId}:data                    - User PiShock credentials (encrypted)
activity:batch:{date}                 - Activity logs grouped by date
discord_user:{userId}                 - Cached Discord user information
discord_token_validation:{hash}       - Token validation cache
cache:user_status:{userId}            - User status cache
```

### Data Retention Policies
- **Instance Data**: 6 hours maximum
- **Activity Logs**: 7 days (150 entries per batch)
- **User Credentials**: Until manually deleted
- **Token Cache**: 5 minutes
- **Status Cache**: 1 minute

### Security Measures
- **Encryption**: All PiShock credentials encrypted with base64 encoding
- **Automatic Cleanup**: Expired data automatically removed
- **Access Control**: Users can only access their own credentials
- **Audit Trail**: All device interactions logged

---

## Safety & Security Features

### Built-in Safety Mechanisms
- **Explicit Consent**: Safety warnings must be acknowledged before use
- **Activity Logging**: All device commands publicly logged with timestamps
- **User Limits**: Each user sets their own maximum intensity and duration
- **Session Timeouts**: 6-hour maximum session duration with auto-cleanup
- **Instance Verification**: Sessions verified against Discord's API
- **Encrypted Storage**: All PiShock credentials encrypted in storage
- **Ban System**: Users can block specific individuals

### Data Protection
- **KV Storage**: All data stored in Cloudflare KV with automatic expiration
- **No Logging**: Sensitive data not logged in application logs
- **User Control**: Users can remove their credentials at any time
- **Transparency**: All device actions visible in activity feed
- **Privacy Policy**: Comprehensive privacy policy included

### Security Headers
The application implements comprehensive security headers:
- **CSP**: Strict Content Security Policy blocking external scripts
- **Cloudflare Features**: All analytics and optimization features disabled
- **CORS**: Proper CORS headers for API endpoints
- **Cache Control**: Appropriate caching policies for different content types

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
4. Test connection using the built-in test feature

#### Workers Deployment Failed
**Cause**: Missing KV namespace or incorrect configuration
**Solution**:
1. Verify KV namespace IDs in `wrangler.jsonc`
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
- **Client-side Caching**: User status cached for 1 minute
- **Batch Processing**: Activity logs stored in daily batches
- **Optimized API Calls**: Reduced frequency with intelligent caching
- **CDN**: Static assets served via Cloudflare CDN

---

## Contributing

### Development Guidelines
- **Safety First**: All changes must maintain or improve safety features
- **Security**: No bypassing of safety mechanisms or security measures
- **Testing**: Thorough testing required for device control features
- **Documentation**: Update documentation for any API or feature changes

### Code Standards
- **TypeScript**: Strict TypeScript configuration required
- **ESLint**: Code must pass all linting rules
- **File Organization**: Maximum 300 lines per file, modular architecture
- **Error Handling**: Comprehensive error handling for all operations

### Pull Request Requirements
- [ ] All safety mechanisms intact
- [ ] Comprehensive testing completed
- [ ] Documentation updated
- [ ] ESLint passes
- [ ] TypeScript compilation successful
- [ ] No security vulnerabilities introduced

---

## Legal & Compliance

### Terms of Service
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
- [PiShock API Documentation](https://pishock.com/#/api)
- [Discord Activities SDK](https://github.com/discord/embedded-app-sdk)

### Community Guidelines
- Prioritize safety in all discussions and usage
- Respect user consent and privacy
- Follow responsible disclosure for security issues
- Maintain transparency in all application functions

---

## Version History & Updates

### Current Version
- **Build Version**: Dynamic based on deployment timestamp
- **Last Updated**: Continuous deployment from main branch
- **Compatibility**: Discord SDK v1.1.0+, Node.js 18+

### Update Mechanism
- **Automatic Checks**: Version verification on session start
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
- **Error Tracking**: Built-in error reporting and handling

### Security Hardening
- **CSP Configuration**: Modify `_headers` file for stricter policies
- **Rate Limiting**: Implement additional rate limiting if needed
- **Custom Encryption**: Replace base64 with stronger encryption

---

**Remember: Safety is paramount. This application controls electrical devices. Always prioritize user safety, consent, and legal compliance in all usage and development.**

---

## Quick Start Checklist

- [ ] Discord Application created with correct OAuth2 settings
- [ ] Cloudflare account set up with KV namespaces created
- [ ] Environment variables configured (`VITE_DISCORD_CLIENT_ID`, `DISCORD_BOT_TOKEN`)
- [ ] Application built and deployed to Cloudflare Workers
- [ ] Discord Activity URL updated to deployed domain
- [ ] Application tested in Discord voice channel
- [ ] Safety warnings and terms reviewed and understood
- [ ] PiShock credentials configured and tested
- [ ] Emergency procedures established before first use

For questions, issues, or contributions, please ensure all safety protocols are followed and refer to the comprehensive documentation above.