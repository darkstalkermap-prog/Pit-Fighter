# PITFALL: Arena of Blood

A lightweight medieval arena game made with **JavaScript, HTML Canvas, and CSS**. No Unreal Engine, game engine download, external art, or runtime dependencies are needed.

## Play

Open **[Browser/Play-Pitfall.html](Browser/Play-Pitfall.html)** in a modern desktop browser and select **Enter the Arena**. This single file contains the complete game and works offline.

The GitHub Pages deployment address is **https://darkstalkermap-prog.github.io/Pit-Fighter/**. Availability depends on a successful Pages deployment; a live deployment has not been verified from the cloud workspace.

### Controls

| Input | Action |
| --- | --- |
| WASD | Move |
| Mouse | Aim your sword and shield |
| Left mouse, press and release | Light attack |
| Hold left mouse at least 0.35 seconds, then release | Heavy attack |
| Hold right mouse | Block attacks from the front |
| Escape | Pause / resume |

Defeat **eight opponents within three minutes**. Three AI knights fight in the arena. Fallen fighters respawn after three seconds. Attacks and blocking consume stamina; stop attacking and lower your shield to recover. Walls and pillars block movement and sword hits. The golden ring marks your Knight.

## Current game

- 2D overhead arena with a controllable Knight and three AI rivals.
- Light/heavy attacks with windup, swing and recovery phases.
- Directional blocking, guard breaks, stamina and armor-adjusted damage.
- Health, death, respawning, match timer, elimination goal and restart.
- Procedural graphics, hit particles and synthesized impact sounds.
- Pause/resume, including automatic pause when the window loses focus.

This release is **single-player**. It does not include online multiplayer, six playable classes, third-person 3D graphics, or matchmaking. Those are future development features, not requirements to play this version. The former Unreal scaffold was removed; its source remains in Git history.

## Develop and test

Use Node.js 24 for tests and Python 3 for the optional local server and HTML bundler. Playing the standalone file does not require either tool. No `npm install` is necessary.

From the repository root:

```sh
npm test
npm run build
npm start
```

The local server uses port 8000 and serves the `Browser` folder. After source changes, run `npm run build` to refresh `Browser/Play-Pitfall.html` before sharing it. GitHub Actions builds that file again before deployment.

| File | Purpose |
| --- | --- |
| `Browser/combat.mjs` | Combat rules, resources, damage and collisions |
| `Browser/game.mjs` | Game loop, inputs, AI, rendering, audio and match flow |
| `Browser/index.html` | Interface structure |
| `Browser/style.css` | Interface styling |
| `Browser/combat.test.mjs` | Combat regression tests |
| `Scripts/build_browser.py` | Packages the game into a standalone HTML file |
| `.github/workflows/pages.yml` | Tests, builds and publishes the game |

Keep combat rules separate from rendering so the presentation can be upgraded later. Moving to 3D or multiplayer will require additional implementation; changing graphics alone does not provide those features.

## GitHub Pages

1. Push or merge changes into `main`.
2. Under **Settings → Pages → Build and deployment**, choose **GitHub Actions**.
3. Open **Actions → Deploy browser game to GitHub Pages**. Wait for both build and deploy to succeed. If needed, use **Run workflow** on `main` after enabling Pages.
4. Open the URL shown by the successful deployment.

The workflow publishes only the generated browser game as `index.html`. Each visitor plays a separate local match against AI; GitHub Pages is not a multiplayer server. Repository visibility and your GitHub plan may affect Pages availability.
