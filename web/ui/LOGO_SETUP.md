# Logo Setup Instructions

## Where to Place the Logo

Place your logo file (`logo.png`) in one of these locations:

1. **Recommended**: `web/ui/public/logo.png` (Vite will serve this automatically)
2. **Alternative**: `web/ui/logo.png` (root of ui folder)

## Logo Specifications

- **Format**: PNG (with transparency preferred)
- **Size**: 32x32px to 64x64px recommended
- **Aspect Ratio**: 1:1 (square)

## Where the Logo Appears

The logo has been integrated in the following locations:

1. **Header** (top left) - Next to "IndieLens" text, 32x32px
2. **"Why We're Here" page** - Next to the title, 48x48px
3. **"How It Works" page** - Next to the title, 48x48px
4. **Favicon** - Browser tab icon

## Testing

After placing the logo:
1. Restart the dev server: `npm run dev`
2. Check the header - logo should appear next to "IndieLens"
3. Navigate to "Why We're Here" - logo should appear next to the title
4. Check browser tab - favicon should show the logo

If the logo doesn't appear, check:
- File is named exactly `logo.png` (case-sensitive)
- File is in the correct location
- Browser cache (try hard refresh: Ctrl+Shift+R)

