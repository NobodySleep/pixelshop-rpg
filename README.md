# PixelShop — A Rogue-like RPG

A Photoshop-themed rogue-like RPG with Dead Cells-style gameplay.

## Play

**GitHub Pages:** [https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/dist/](https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/dist/)

## Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages**
3. Set Source to **Deploy from a branch**
4. Set Branch to `main`, folder to `/dist`
5. Click **Save** — your game will be live in ~1 minute!

## Development

```bash
# Install dependencies
npm install

# Rebuild the bundle after making code changes
npm run build

# Local dev server (then open http://localhost:3000)
npm run dev
```

## Structure

```
scratch/
├── js/           # Source JS (ES6 modules)
├── dist/         # Built output → deploy THIS folder to GitHub Pages
│   ├── index.html
│   ├── style.css
│   └── bundle.js
├── style.css     # Source CSS
└── index.html    # Dev entry point (uses ES6 modules directly)
```
