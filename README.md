# PITFALL: Arena of Blood — 3D browser game

A low-poly, third-person medieval arena built with **JavaScript and Three.js/WebGL 2**. No Unreal Engine, account, or game installation is required.

## Play in your browser

**[Play PITFALL](https://darkstalkermap-prog.github.io/Pit-Fighter/)**

Use a modern desktop browser with hardware acceleration enabled and a keyboard and mouse. Click **Enter the Arena** to capture the mouse. If mouse capture is unavailable, the left/right arrow keys turn your Knight. Escape releases the mouse and pauses the match.

You can also download `Browser/Play-Pitfall.html` and open that single file offline. The bundled file includes the renderer, game logic, styles, and licenses; it needs no CDN or external assets.

| Input | Action |
| --- | --- |
| WASD | Move relative to your view |
| Mouse | Third-person camera and attack direction |
| Left/right arrows | Alternative turning controls |
| Left mouse, press and release | Light sword attack |
| Hold left mouse at least 0.35 seconds, then release | Heavy attack |
| Hold right mouse | Block attacks from the front |
| Escape | Pause / release mouse |

Defeat **eight rivals in three minutes**. Three AI knights fight in the arena; all fallen fighters respawn after three seconds. Attacks and guarding consume stamina. Lower your shield and stop attacking to recover. Pillars and the arena boundary block movement; pillars also stop sword hits. The teal Knight with a golden ground ring is yours.

## Features and limits

- Actual 3D geometry, perspective camera, lighting and shadows.
- Third-person follow camera that shortens its distance to avoid arena walls and columns.
- Procedural armored Knights with sword, shield and simple walk/swing animations.
- Stone arena, spectator terraces, pillars, banners and torches.
- Light/heavy attacks with windup, release and recovery; directional blocking and guard breaks.
- Health, stamina, deaths, respawns, AI combat, timer, victory target and rematch.
- Impact particles, synthesized sound, HUD and automatic pause on losing focus.

This is a **single-player prototype against AI**, with one Knight class and one arena. Online multiplayer, six classes, matchmaking, professional character animation and realistic graphics remain future work. No 60 FPS hardware performance target has been established. Game logic uses a fixed simulation step; rendering uses a capped device pixel ratio to reduce GPU cost.

## Development

Requires Node.js 24. Python 3 is used only by the optional development server.

```sh
npm ci
npm test
npm run build
npm start
```

`npm start` rebuilds the game and serves `_site` on port 8000. Open the local server in your browser. Do not open `Browser/index.html` directly: it is a build template whose source module imports are resolved by the bundler.

`npm run build` produces both the standalone `Browser/Play-Pitfall.html` and the GitHub Pages `_site/index.html`. Run it after source changes before sharing the file. Dependencies are pinned in `package-lock.json`; Three.js's MIT license is embedded in the generated HTML.

### Browser validation

```sh
npx playwright install --with-deps chromium
npm run build
npm run test:browser
```

To use an installed Chromium instead, set `CHROMIUM_PATH` to its executable for the test command. The smoke test starts its own local HTTP server, verifies WebGL 2 at the repository's Pages subpath, starts a match, exercises movement/turn inputs, heavy attack, stamina, blocking, and pause/resume, and fails on browser errors. Screenshots are written to `test-results/`. Headless testing uses software rendering; it does not measure performance on a gaming PC.

### Project layout

| File | Purpose |
| --- | --- |
| `Browser/combat.mjs` | Combat rules, resources, damage and collision |
| `Browser/game.mjs` | Input, AI, fixed-step simulation, match flow and HUD |
| `Browser/view3d.mjs` | Three.js arena, Knight models, camera, lighting and effects |
| `Browser/index.html`, `Browser/style.css` | Menu and HUD |
| `Browser/combat.test.mjs` | Combat regression tests |
| `Scripts/build_browser.mjs` | esbuild bundling and standalone/site generation |
| `Scripts/browser_smoke.mjs` | Playwright browser validation |
| `.github/workflows/pages.yml` | Install, test, build and publish |

## GitHub Pages

Recommended configuration: **Settings → Pages → Source → GitHub Actions**. Push or merge into `main`, then wait for **Deploy browser game to GitHub Pages** to finish. The workflow uploads only `_site`, with the game at its root.

If the repository instead uses **Deploy from a branch**, choose **main / (root)**. The root `index.html` forwards visitors directly to the committed standalone game. This fallback ensures the root URL also works with branch-based Pages publication.

Each visitor plays a separate local match. GitHub Pages serves the game files; it does not host a multiplayer game server.
