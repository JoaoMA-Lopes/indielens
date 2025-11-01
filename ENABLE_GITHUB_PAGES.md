# Enable GitHub Pages NOW!

## Step 1: Go to GitHub

1. Open: https://github.com/JoaoMA-Lopes/indielens
2. Click **"Settings"** tab (top of repo)
3. Click **"Pages"** in left sidebar (under "Code and automation")

## Step 2: Configure Pages

**Source**:
- Select: **Deploy from a branch**
- **Branch**: `chrome-2025`
- **Folder**: `/docs` or `/ (root)`
- **Click Save**

## Step 3: Choose Demo Location

**If using `/docs` folder**:
```bash
# Create docs folder and move demo
mkdir docs
cp web/demo.html docs/index.html
git add docs/
git commit -m "Add demo for GitHub Pages"
git push
```

**If using root**:
```bash
# Copy demo to root
cp web/demo.html demo.html
git add demo.html
git commit -m "Add root demo"
git push
```

## Step 4: Get Your URL

After saving, GitHub will give you:
`https://joaoma-lopes.github.io/indielens/`

Or if in `/docs`:
`https://joaoma-lopes.github.io/indielens/demo.html`

## Step 5: Test!

Wait 1-2 minutes, then visit the URL.
Your demo should be live!

---

**After this works, you have all three URLs for submission!** 🎉

