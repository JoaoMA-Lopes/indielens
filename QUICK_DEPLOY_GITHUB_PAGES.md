# Quick Deploy to GitHub Pages

## For Public Access

You need a **public URL** for judges. Here's the fastest way:

## Step 1: Commit All Files

```bash
# Add all new documentation
git add LICENSE README.md JUDGES_SETUP.md HACKATHON_SUBMISSION_NOTES.md
git add SUBMISSION_STRATEGY.md SUBMISSION_CHECKLIST.md FINAL_SUBMISSION_READY.md
git add web/demo.html DEPLOYMENT_OPTIONS.md

# Commit
git commit -m "Add Chrome AI integration and submission documentation"

# Push to GitHub
git push origin chrome-2025
```

## Step 2: Enable GitHub Pages

1. Go to your GitHub repository settings
2. Click "Pages" in left sidebar
3. Under "Source", select "Deploy from a branch"
4. Select branch: `chrome-2025`
5. Select folder: `/ (root)` or `/docs` if you put demo.html there
6. Click "Save"

GitHub will generate a URL like:
`https://YOURUSERNAME.github.io/indielens/`

## Step 3: Point to Demo File

**Option A**: Copy demo.html to root:
```bash
cp web/demo.html demo.html
git add demo.html
git commit -m "Add demo for GitHub Pages"
git push
```

**Option B**: Configure to serve from web/:
- In Pages settings, select `/web` folder
- Demo will be at: `https://YOURUSERNAME.github.io/indielens/demo.html`

## Step 4: Update Submission

Update your submission with:
1. **Demo URL**: `https://YOURUSERNAME.github.io/indielens/demo.html`
2. **GitHub Repo**: `https://github.com/YOURUSERNAME/indielens`
3. **Video**: Your demo video link

## Alternative: Netlify Drop

Even faster:
1. Go to https://netlify.com
2. Drag the `web/` folder onto their drop zone
3. Get instant URL!

Both methods give you a **publicly accessible demo**!

