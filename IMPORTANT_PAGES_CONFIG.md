# ⚠️ URGENT: Fix GitHub Pages Configuration

Your GitHub Pages site is currently showing the README instead of the demo because it's configured to serve from `/(root)` instead of `/docs`.

## Quick Fix (Do This Now!)

### Step 1: Sign In to GitHub
Go to: https://github.com/login

### Step 2: Go to Pages Settings
Go to: https://github.com/JoaoMA-Lopes/indielens/settings/pages

### Step 3: Change the Configuration
**Current (WRONG)**:
- Source: Deploy from a branch
- Branch: chrome-2025
- Folder: / **(root)** ❌

**Change to (CORRECT)**:
- Source: Deploy from a branch
- Branch: chrome-2025
- Folder: **/docs** ✅

### Step 4: Click Save

### Step 5: Wait 1-2 minutes
Then refresh: https://joaoma-lopes.github.io/indielens/

---

## Why This Matters

Right now, visitors see:
- ❌ README.md (documentation)

After fix, they'll see:
- ✅ docs/index.html (your interactive demo with game cards, AI features, and UI)

---

## Screenshot of Where to Click

In GitHub Pages settings, look for:
```
Source: Deploy from a branch
Branch: chrome-2025
Folder: [dropdown]
```

Change the folder from `/(root)` to `/docs` and click **Save**.

