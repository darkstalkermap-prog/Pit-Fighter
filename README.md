# PITFALL: Arena of Blood

## Play the lightweight version now

Open `Browser/Play-Pitfall.html` in a modern desktop browser. This self-contained file needs no Unreal installation, downloads, server, or internet access. Use WASD to move, mouse to aim, release LMB to attack (hold 0.35 seconds for heavy), RMB to block, and Escape to pause. Defeat eight AI knights within three minutes. Fallen fighters respawn after three seconds.

This is a simplified **2D overhead, single-player** alternative for testing combat now. It includes three AI rivals, directional blocking, stamina, light/heavy attacks, obstacles, hit effects/sounds and match restart. It is not the original third-person multiplayer game. The Unreal source below remains a separate prototype; browser code does not automatically become Unreal code.

For development, run `cd Browser && npm start` (Python 3 required), and `npm test` (Node.js required). No npm dependencies are needed. After changes, run `python3 Scripts/build_browser.py` from the repository root to refresh the standalone HTML. Combat logic lives in `Browser/combat.mjs`; presentation and AI live in `Browser/game.mjs`.

## Host the browser game on GitHub Pages

The workflow in `.github/workflows/pages.yml` runs the combat tests, builds a standalone HTML page, and deploys only that page to GitHub Pages. No Unreal files or backend server are deployed.

1. Commit and push the game files, `Scripts/build_browser.py`, and `.github/workflows/pages.yml` to this repository's **main** branch (or merge a pull request into main). Local workspace files are not automatically on GitHub.
2. In **GitHub → darkstalkermap-prog/Pit-Fighter → Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source. Pages availability depends on your repository visibility and GitHub plan.
3. Under **Actions**, open **Deploy browser game to GitHub Pages**. If the initial run happened before Pages was enabled, use **Run workflow** on **main** or rerun the failed deployment.
4. Wait for both **build** and **deploy** to succeed, then use the URL shown by the deployment. With GitHub's default domain and no custom domain, the expected URL is **https://darkstalkermap-prog.github.io/Pit-Fighter/**.

The workflow is prepared locally; a live deployment has not been verified. Anyone opening the deployed link gets their own single-player match against bots. GitHub Pages does not provide multiplayer game servers. Keyboard and mouse are required.

## Unreal prototype

Unreal Engine **5.7** C++ Phase 1 prototype source for Pit-Fighter. This project has **not been compiled or play-tested in Unreal**: the authoring cloud machine has no Unreal Engine toolchain. Treat this as an implementation awaiting engine validation, not a verified playable build.

## Scope

Implemented in source: over-the-shoulder Knight movement; light/heavy sword swings; windup/release/recovery; forward-facing blocking; stamina costs, drain and regeneration; armor mitigation; health/death; respawn; replicated combat state; server-side swept sword traces; a generated circular arena with pillars and twelve starts; a minimal health/stamina HUD.

The pawn uses engine cubes for armor, sword and shield and procedural sword poses. These are functional visual placeholders, not realistic characters or skeletal combat animations. The arena uses engine primitive meshes and lights. No external art, accounts, services or asset licenses are required beyond Unreal's normal license.

Not implemented: additional classes, lobby/browser, scoring/match modes, directional attacks, timed parries, abilities, sprint/dodge, prediction for attacks, rewind/lag compensation, production animation/audio, graphics presets, or performance validation. Twelve starts and a server build target prepare later work; they do not establish tested 12-player support.

## Windows build and first launch

1. Install Unreal Engine **5.7** using Epic Games Launcher, plus Visual Studio 2022 with **Game development with C++**, the UE-supported MSVC toolchain and Windows SDK. Use the compiler version recommended by your exact UE 5.7 installation.
2. Right-click `Pitfall.uproject` → **Generate Visual Studio project files**. Open `Pitfall.sln`, select **Development Editor / Win64**, and build `Pitfall`.
3. Alternatively, run the engine build script from PowerShell (adjust these paths):

   ```powershell
   $UE = 'C:\Program Files\Epic Games\UE_5.7'
   $Project = 'C:\dev\Pit-Fighter\Pitfall.uproject'
   & "$UE\Engine\Build\BatchFiles\Build.bat" PitfallEditor Win64 Development "-Project=$Project" -WaitMutex
   if ($LASTEXITCODE -ne 0) { throw 'Editor build failed' }
   ```

4. Create the small map asset using the supplied **editor Python** script. It is not a normal Python script; it needs Unreal's `unreal` module. From PowerShell:

   ```powershell
   $Script = 'C:\dev\Pit-Fighter\Scripts\create_arena.py'
   & "$UE\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" $Project '-run=pythonscript' "-script=$Script" -unattended -nop4 -nullrhi
   if ($LASTEXITCODE -ne 0) { throw 'Map generation failed; inspect Saved/Logs' }
   ```

   This creates `/Game/Maps/Prototype`. Re-running preserves an existing map. Verify the success message and the map asset; an empty or failed run is not validation. The generated map is ignored by Git and must be recreated on a fresh checkout. The game mode creates geometry, lighting and spawns at runtime, so the map is empty when not playing.
5. Open `Pitfall.uproject`, load `Content/Maps/Prototype`, and press Play. If opening before map generation warns about a missing map, create an empty level and run `Scripts/create_arena.py` using **Tools → Execute Python Script**, then load the saved map.

## Controls

- WASD: movement; mouse: camera/heading.
- LMB press then release: light attack. Hold at least 0.35 seconds before releasing for heavy.
- Hold RMB: block attacks coming from the front 120-degree arc. Blocking drains stamina; a blocked impact also costs stamina. An unaffordable impact breaks block and damages health.
- Release RMB before attacking. New attacks are rejected until recovery finishes.

Attack choice is sent to the server; the server sets cost, duration, range and damage. Holding the mouse is a local heavy-selection gesture, not a trusted damage or charge-duration claim. Clients never submit hit targets or damage values. Movement uses Unreal CharacterMovement replication. Attack animation follows replicated server phase/time and is not predicted. Server-time sword arcs are sampled with sphere sweeps; walls and pillars stop each trace. There is no historical lag compensation.

## Required two-player acceptance test (not yet run)

In the Editor Play dropdown, select **New Editor Window (PIE)**, **Number of Players = 2**, **Net Mode = Play As Listen Server**. Click each window to capture input. Test both host-attacking-client and client-attacking-host:

1. Both windows show the floor, walls, pillars and both Knights; movement and sword poses are visible remotely. Walk into walls to verify collision.
2. At close range, a light hit removes **20 health** and costs the attacker **18 stamina**; heavy removes **36 health** and costs **32 stamina**. Each swing damages a given target at most once. Out-of-range swings and attacks through a pillar must not damage the opponent.
3. Face an attacker and hold block: an affordable hit removes no health and costs **25 stamina**, plus continuous drain at **8/second**. Turn away: the attack damages health. Exhaust stamina: block ends or breaks; stamina remains nonnegative.
4. Repeated clicks during windup/release/recovery must not cause overlapping attacks. Stamina regenerates at **22/second** only when idle, unblocked and past the regen delay.
5. Kill either Knight: attacks cease, the body tilts, the death message appears, and after three seconds the controller possesses a fresh Knight with **150 health / 100 stamina**. Verify this twice for both players.
6. Disconnect a client and reconnect; confirm the remaining player continues and the new player can move and fight.
7. Repeat with **Play As Client** and an editor dedicated server. Then enable PIE network emulation (e.g. 100 ms latency and packet loss); check authority and state recovery. Input delay is expected without attack prediction; missing hits or stuck states must be investigated.

Record engine version, build result, server/client logs and results of each step before calling the prototype validated. A successful build alone does not validate combat.

For two separate editor processes on LAN, start the host with:

```powershell
& "$UE\Engine\Binaries\Win64\UnrealEditor.exe" $Project '/Game/Maps/Prototype?listen' -game -log
```

On the second machine, use the same compiled project and generated map, start with `-game -log`, and run `open <host-LAN-IP>:7777` in the console. Permit UDP 7777 on the host firewall for the intended LAN. Internet matchmaking, NAT traversal and server discovery are outside Phase 1.

## Architecture and Blueprint locations

| Location | Responsibility |
| --- | --- |
| `Source/Pitfall/Knight.h/.cpp` | Movement/camera, editable `FKnightTuning`, replicated resources/state, validated attack/block RPCs, authoritative tracing/damage/death |
| `Source/Pitfall/BloodPit.h/.cpp` | Replicated actor with deterministic primitive arena components and lighting |
| `Source/Pitfall/PitfallGameMode.h/.cpp` | Server-only arena/start creation, default classes, farthest-from-living-player spawn selection |
| `Source/Pitfall/PitfallHUD.h/.cpp` | Local canvas HUD using replicated pawn state |
| `Config/DefaultInput.ini` | Editable legacy input mappings; no Enhanced Input assets needed |
| `Scripts/create_arena.py` | Idempotent editor-only map creation |
| `Source/Pitfall*.Target.cs` | Game, editor and future dedicated-server build targets |

Optional authoring extensions: create `Content/Blueprints/BP_Knight` derived from `AKnight`; edit `Tuning` in Class Defaults and add licensed skeletal mesh/animation assets under `Content/Characters/Knight`. Create `Content/Blueprints/BP_PitfallGameMode` derived from the native game mode and set its default pawn to `BP_Knight`; assign it in the map's World Settings. Keep authority and damage in C++. Animation Blueprints can read `Phase`, `PhaseStarted`, `bHeavy`, `bBlocking` and `Health`. A future UMG HUD belongs under `Content/UI`; no Blueprint assets are required for the native baseline. Configure tuning identically on server and clients via class defaults.

Dedicated server packaging requires a suitable **source-built UE 5.7** toolchain; the Launcher editor alone is not evidence that `PitfallServer` can be packaged. Server packaging, cooking, Windows release builds and 12-player performance tests remain future validation work.
