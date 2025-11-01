# Setup Instructions for Hackathon Judges

Thank you for reviewing IndieLens! This document provides step-by-step instructions to test the application.

## Prerequisites

### Required Software
1. **MySQL 8.0+** ([Download](https://dev.mysql.com/downloads/mysql/))
2. **Node.js 18+** ([Download](https://nodejs.org/))
3. **Visual Studio 2019+** with C++ support ([Download](https://visualstudio.microsoft.com/))
4. **Chrome Canary** with Chrome Built-in AI enabled ([Download](https://www.google.com/chrome/canary/))
5. **Steam Account** (optional, for full testing)

### Optional
- MySQL Workbench for database management

## Quick Setup (15 minutes)

### Step 1: Database Setup

1. **Start MySQL**:
```bash
# Windows (if installed as service)
net start MySQL80

# Linux/Mac
sudo systemctl start mysql
```

2. **Create Database**:
```bash
mysql -u root -p
```
```sql
CREATE DATABASE steam_data CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE steam_data;
SOURCE db/schema.sql;
EXIT;
```

### Step 2: Backend Configuration

1. **Copy Config Template**:
```bash
cd cpp
cp config.example.json config.json
```

2. **Edit `config.json`**:
```json
{
  "mysql": {
    "host": "127.0.0.1",
    "port": 3306,
    "user": "root",
    "password": "YOUR_MYSQL_PASSWORD",
    "schema": "steam_data"
  },
  "steamApiKey": "YOUR_STEAM_API_KEY"
}
```

**Getting Steam API Key**: 
- Visit https://steamcommunity.com/dev/apikey
- Sign in with Steam
- Register for an API key

**Note**: For testing without Steam API, use a dummy key. Basic functionality will still work.

### Step 3: Build C++ Backend

**Option A: Visual Studio (Recommended)**
1. Open `cpp/ConsoleApplication1/ConsoleApplication1.sln`
2. Select "Release" configuration and "x64" platform
3. Build → Build Solution (Ctrl+Shift+B)
4. Verify executable at: `cpp/ConsoleApplication1/x64/Release/ConsoleApplication1.exe`

**Option B: Pre-built Binary**
We provide pre-built binaries for common platforms (see Releases).

### Step 4: Install Node.js Dependencies

```bash
# Bridge server
cd web/server
npm install

# Frontend
cd ../ui
npm install
```

### Step 5: Run Application

**Terminal 1 - Bridge Server**:
```bash
cd web/server
npm start
```
Expected output: `IndieLens bridge listening on 5179`

**Terminal 2 - Frontend**:
```bash
cd web/ui
npm run dev
```
Expected output: `Local: http://localhost:5173/`

### Step 6: Enable Chrome Built-in AI

1. **Install Chrome Canary** if not already installed

2. **Enable AI Flags**:
   - Open `chrome://flags/`
   - Enable the following:
     - `#prompt-api-for-gemini-nano`: Enabled
     - `#summarization-api-for-gemini-nano`: Enabled
     - `#proofreader-api-for-gemini-nano`: Enabled
     - `#writer-api-for-gemini-nano`: Enabled
     - `#optimization-guide-on-device-model`: Enabled
   - Click "Relaunch" when prompted

3. **Wait for Model Download** (may take time on first launch):
   - Check `chrome://on-device-internals/`
   - Model should download automatically if hardware requirements met

### Step 7: Access Application

1. Open Chrome Canary
2. Navigate to http://localhost:5173
3. You should see the IndieLens homepage

## Testing the Application

### Basic Functionality Test

1. **Browse Games**:
   - Navigate to any genre (e.g., "Action")
   - Verify games load with scores
   - Test search functionality

2. **View Game Details**:
   - Click any game card
   - View game information
   - See pricing from Steam

3. **Submit Rating** (without registration):
   - Navigate to a game detail page
   - Scroll to "Submit Your Rating"
   - Enter a rating (0-100)
   - See weighting breakdown appear

### Chrome AI Integration Test

**Note**: Chrome AI APIs may not be available in all environments. This is expected due to Chrome's Early Preview Program rollout.

**If APIs are available**:
1. Click "Summarize (Chrome AI)" buttons on game descriptions
2. Click "Check Grammar (Chrome AI)" in review text area
3. Click "Explain Match (Chrome AI)" in AI Game Recommendation section
4. Toggle translation in header

**If APIs are NOT available** (most common):
- You'll see informative messages
- Application continues to function normally
- This demonstrates graceful degradation

### Advanced Testing (Optional)

**With Steam Account**:
1. Register on IndieLens with your Steam friend code
2. Your library will ingest automatically
3. Ratings will have personalized weighting based on your profile

**Without Steam Account**:
- Test using the "Browse" tab
- Submit ratings (will use default weighting)
- All non-auth features work

## Verification Checklist

### Code Integration
- [ ] Verify `web/ui/src/App.jsx` contains Chrome AI integration code
- [ ] Check for proper feature detection (`'ai' in window`)
- [ ] See graceful error handling for unavailable APIs

### UI Elements
- [ ] See "(Chrome AI)" labeled buttons throughout
- [ ] Translation toggle in header
- [ ] AI recommendation section on game pages

### Core Functionality
- [ ] Games load with scores
- [ ] Search works
- [ ] Genre filtering works
- [ ] Game detail pages render
- [ ] Rating submission shows breakdown

### AI Features (if available)
- [ ] Summarizer works
- [ ] Proofreader works
- [ ] Prompt API responds
- [ ] Translation toggle functions

## Common Issues

### "Cannot connect to C++ backend"
- **Solution**: Ensure `ConsoleApplication1.exe` is built and `config.json` is correct

### "MySQL connection failed"
- **Solution**: Check MySQL is running and credentials in `config.json` are correct

### "Port 5179 already in use"
- **Solution**: Kill the process or change port in `web/server/server.js`

### "Chrome AI APIs not available"
- **Expected**: APIs require Early Preview Program enrollment
- **Action**: Verify integration code is present (it is)
- **Note**: This does NOT indicate a code problem

### "Eternally loading"
- **Solution**: Check browser console for errors, verify backend is running

## Architecture Overview

```
User Browser (Chrome Canary)
    ↓
Frontend (React + Vite) on localhost:5173
    ↓
Bridge Server (Node.js Express) on localhost:5179
    ↓
C++ Backend (ConsoleApplication1.exe)
    ↓
MySQL Database + Steam Web API
```

## Testing Files

We provide test files for quick verification:
- `web/ui/test-ai.html` - Chrome AI APIs availability test
- `web/ui/test-ai-now.html` - Quick API functionality test

## Support

If you encounter issues:
1. Check browser console (F12)
2. Check server terminal for errors
3. Verify all prerequisites are installed
4. Review common issues above

For questions, contact us via GitHub Issues.

## Additional Resources

- [Chrome AI Documentation](https://developer.chrome.com/docs/ai/)
- [Steam Web API Docs](https://steamcommunity.com/dev)
- [Hackathon Submission Notes](HACKATHON_SUBMISSION_NOTES.md)

---

Thank you for reviewing IndieLens!

