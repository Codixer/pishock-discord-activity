---

<div align="center">

**⚡ Made with [Bolt.new](https://bolt.new/?rid=u8s05i) ⚡** (AI)

*Get 200K extra credits by using this link! Upgrade to Pro for 5M extra tokens.*

---

</div>

# PiShock Discord Activity

A Discord Activity application that enables consensual control of PiShock electrical devices in a multiplayer Discord environment. This application provides a safe, transparent, and accountable way for Discord users to interact with PiShock devices through a purpose-built interface.

## ⚠️ **CRITICAL SAFETY WARNING** ⚠️

**This application controls electrical shock devices that can cause physical harm, injury, or death if misused.**

- **Age Requirement**: You must be 18+ to use this application
- **Explicit Consent**: Only use with explicit, informed consent from all participants
- **Safety First**: Always start with lowest intensity settings and establish safe words
- **Legal Compliance**: Ensure compliance with all local laws and regulations
- **Personal Responsibility**: Users assume all risks and responsibility for safe use

## What This Application Does

- **Discord Integration**: Runs as a native Discord Activity in voice channels or DMs
- **Device Control**: Send shock, vibrate, and beep commands to PiShock devices
- **Multiplayer Support**: Multiple users can participate with their own devices
- **Safety Features**: User-configurable limits, activity logging, and consent mechanisms
- **Session Management**: 6-hour session limits with automatic cleanup
- **Real-time Updates**: Live participant list and activity feed
- **Transparency**: All actions are publicly logged for accountability

## Architecture Overview

```
Discord Client → Discord Activity → Cloudflare Workers → PiShock API
                     ↓
                 KV Storage (user data, activity logs)
                     ↓
                 Instance Management & Verification
```

## Prerequisites

Before setting up your own instance, you'll need:

### Required Accounts & Services
1. **Discord Developer Account** - For creating the Discord Application
2. **Cloudflare Account** - For hosting the application (Free tier sufficient)
3. **PiShock Account** - For device API access (users need their own accounts)
4. **Node.js 18+** - For building and deploying the application

### Required Knowledge
- Basic understanding of Discord Applications and Activities
- Familiarity with environment variables and command line tools
- Understanding of the safety implications of electrical shock devices

---

## Setup Instructions

### Step 1: Discord Application Setup

#### 1.1 Create Discord Application
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name (e.g., "PiShock Controller")
3. Note down your **Application ID** (you'll need this as `DISCORD_CLIENT_ID`)

#### 1.2 Configure OAuth2
1. In your Discord Application, go to **OAuth2 → General**
2. Add these Redirect URIs:
   ```
   https://your-domain.pages.dev/
   https://your-domain.pages.dev/auth/callback
   ```
3. Under **Scopes**, ensure these are available:
   - `identify`
   - `guilds`
   - `guilds.members.read`
   - `rpc.activities.write`

#### 1.3 Create Discord Bot
1. Go to **Bot** section in your Discord Application
2. Click "Add Bot" if not already created
3. Copy the **Bot Token** (you'll need this as `DISCORD_BOT_TOKEN`)
4. Enable these **Privileged Gateway Intents**:
   - Server Members Intent
   - Message Content Intent

#### 1.4 Configure Discord Activity
1. Go to **Activities** in your Discord Application
2. Click "Add Activity" or configure existing
3. Set the **Activity URL** to: `https://your-domain.pages.dev`
4. Configure **Activity Details**:
   - **Name**: "PiShock Controller"
   - **Description**: "Consensual PiShock device control in Discord"
   - **Tags**: Add relevant tags like "social", "utility"

### Step 2: Cloudflare Workers Setup

#### 2.1 Clone and Setup Repository
```bash
# Clone the repository
git clone <your-repo-url>
cd pishock-discord-activity

# Install dependencies
npm install

# Login to Cloudflare (if not already done)
npx wrangler login
```

#### 2.2 Create KV Namespace
```bash
# Create production KV namespace
npx wrangler kv:namespace create "PISHOCK_KV"

# Create preview KV namespace  
npx wrangler kv:namespace create "PISHOCK_KV" --preview

# Note down the returned namespace IDs
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

### Step 3: Environment Variables Configuration

#### 3.1 Build-time Variables (Required for frontend)
Create a `.env` file in the project root:
```env
# Discord Application ID (public, safe for frontend)
VITE_DISCORD_CLIENT_ID=your_discord_application_id_here
```

#### 3.2 Runtime Variables (Required for backend functions)
Set these in **Cloudflare Workers Dashboard** → Your Worker → **Settings** → **Variables**:

```
DISCORD_BOT_TOKEN = your_discord_bot_token_here
```

**Security Note**: Never use `VITE_` prefix for sensitive data like bot tokens!

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

### Step 5: Discord Activity Registration

#### 5.1 Update Activity URL
In Discord Developer Portal → Your Application → Activities:
1. Update **Activity URL** to your deployed Cloudflare domain:
   ```
   https://your-worker-name.your-subdomain.workers.dev
   ```

#### 5.2 Test Activity in Discord
1. Go to a Discord voice channel or DM
2. Click the Activities button (rocket ship icon)
3. Your "PiShock Controller" should appear in the list
4. Click to launch and test the application

---

## User Setup Guide

### For Application Users (Not Developers)

#### Step 1: PiShock Account Setup
1. Create a PiShock account at [pishock.com](https://pishock.com)
2. Get your devices and note their share codes
3. Obtain your API key from PiShock account settings

#### Step 2: Using the Discord Activity
1. Join a Discord voice channel where the activity is available
2. Click the Activities button and select "PiShock Controller"
3. Accept the safety warnings (read them carefully!)
4. Configure your PiShock credentials in the settings panel:
   - **API Key**: Your PiShock API key
   - **Username**: Your PiShock username  
   - **Share Code**: Device share code for receiving commands
   - **Safety Limits**: Set your maximum intensity and duration
5. Test your connection to ensure everything works
6. Select other participants to send commands to (with their consent!)

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

### Environment Setup for Development
Create `.env` file:
```env
VITE_DISCORD_CLIENT_ID=your_discord_application_id_here
```

### Development vs Production

| Environment | Data Source | Authentication | Limitations |
|-------------|-------------|----------------|-------------|
| **Development** | Mock data | Simulated | No real PiShock control |
| **Production** | Discord API | OAuth2 | Full functionality |

---

## Security & Safety Features

### Built-in Safety Mechanisms
- **Explicit Consent**: Safety warnings must be acknowledged before use
- **Activity Logging**: All device commands are publicly logged with timestamps
- **User Limits**: Each user sets their own maximum intensity and duration
- **Session Timeouts**: 6-hour maximum session duration
- **Instance Verification**: Sessions verified against Discord's API
- **Encrypted Storage**: All PiShock credentials encrypted in storage

### Data Protection
- **KV Storage**: All data stored in Cloudflare KV with automatic expiration
- **No Logging**: Sensitive data not logged in application logs
- **User Control**: Users can remove their credentials at any time
- **Transparency**: Privacy policy and terms clearly outlined

---

## Configuration Reference

### Environment Variables

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `VITE_DISCORD_CLIENT_ID` | Build | Yes | Discord Application ID (public) |
| `DISCORD_BOT_TOKEN` | Runtime | Yes | Discord Bot Token (sensitive) |

### KV Storage Structure
```
instance:{instanceId}:status          - Instance validity and metadata
instance_data:{instanceId}            - Instance-specific application data  
user:{userId}:data                    - User PiShock credentials (encrypted)
activity:batch:{date}                 - Activity logs grouped by date
discord_user:{userId}                 - Cached Discord user information
app:latest_version                    - Version tracking for updates
```

### Session Management
- **Instance Lifetime**: 6 hours maximum
- **Data Retention**: Activity logs kept for 30 days
- **Auto-cleanup**: Expired data automatically removed
- **Version Updates**: Automatic session closure on app updates

---

## API Endpoints

### Public Endpoints
- `GET /api/version` - Application version information
- `GET /api/verify-instance` - Instance validation

### Authenticated Endpoints (Require Discord OAuth)
- `POST /api/auth/discord` - Discord authentication
- `GET/PUT /api/users/{userId}/pishock-*` - User PiShock management
- `POST /api/users/{userId}/pishock-execute` - Execute PiShock commands
- `GET /api/activity-log` - Retrieve activity history
- `GET /api/discord/guilds/{guildId}/members/{userId}` - Guild member data

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

#### Workers Deployment Failed
**Cause**: Missing KV namespace or incorrect configuration
**Solution**:
1. Verify KV namespace IDs in `wrangler.jsonc`
2. Ensure Cloudflare account has Workers access
3. Check environment variables are set correctly

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
```

### Getting Help
1. Check the [Discord Developer Documentation](https://discord.com/developers/docs/activities/overview)
2. Review [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/)
3. Ensure all safety protocols are being followed
4. For safety concerns, immediately discontinue use

---

## Legal & Safety Disclaimers

### Terms of Use
- This application is provided for educational and consensual adult use only
- Users must be 18+ years of age
- Explicit consent required from all participants
- Users assume all risks and responsibility for safe use
- Must comply with all applicable local laws and regulations

### Liability
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

---

## Support & Contributing

### Getting Support
- Review this documentation thoroughly
- Check troubleshooting section for common issues
- Ensure all safety protocols are followed
- For safety emergencies, discontinue use immediately

### Contributing
- Follow all safety guidelines when testing
- Ensure code changes don't bypass safety mechanisms
- Test thoroughly in development environment
- Document any new safety considerations

### Code of Conduct
- Prioritize safety in all development decisions
- Respect user consent and privacy
- Follow responsible disclosure for security issues
- Maintain transparency in all application functions

---

**Remember: Safety is paramount. This application controls electrical devices. Always prioritize user safety, consent, and legal compliance.**
