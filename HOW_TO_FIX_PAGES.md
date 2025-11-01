# 🔧 How to Fix GitHub Pages to Show Your Demo

## The Problem
GitHub Pages is showing `README.md` instead of your interactive demo.

## The Solution
Change the source folder from `/ (root)` to `/docs`.

---

## Step-by-Step Instructions

### 1. Go to GitHub Pages Settings
**URL**: https://github.com/JoaoMA-Lopes/indielens/settings/pages

(You MUST be signed in to GitHub!)

### 2. Find This Section:
```
Build and deployment
Source
  [Dropdown menu] "Deploy from a branch"
  
Branch
  [Dropdown] chrome-2025
  [Dropdown] / (root)  ← This is WRONG!
```

### 3. Change the Folder Dropdown:
Click the dropdown that says `/ (root)` and select **`/docs`** instead.

### 4. Click "Save"

### 5. Wait 1-2 Minutes

### 6. Refresh Your Site:
https://joaoma-lopes.github.io/indielens/

---

## What You Should See After Fix

✅ Game cards with images  
✅ "DEMO MODE" badge  
✅ AI integration section  
✅ Interactive demo buttons  
✅ Professional UI layout  

**NOT** the README documentation.

---

## Troubleshooting

**If you can't find the Settings page:**
- Make sure you're signed in to GitHub
- The URL must be exactly: `github.com/JoaoMA-Lopes/indielens/settings/pages`
- If you get 404, sign in first, then try again

**If the change doesn't work:**
- Wait 2-3 minutes (GitHub needs time to rebuild)
- Try hard refresh: Ctrl+Shift+R or Cmd+Shift+R
- Check that you're viewing the `chrome-2025` branch, not `main`

---

## Why This Matters

Your README is great documentation, but judges need to see your **actual application demo** to understand the quality of your work!

The demo HTML file exists at `docs/index.html` in your repository—you just need to tell GitHub Pages to serve it.

