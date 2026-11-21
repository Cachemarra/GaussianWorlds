# GaussianWorlds PoC — Gemini (Neon High)

> Part of the [GaussianWorlds benchmark](../README.md). This version evolved over **7 distinct iterations** (using **3 parallel subagents** in iteration 7).  
> **Live Demo:** https://cachemarra.github.io/GaussianWorlds/neon-high/

A continuous procedural world generated entirely with **Gaussian Splats** (no external 3D models or scans), built with **Three.js (`0.180.0`)** and **Spark (`@sparkjsdev/spark@2.4.0`)** with no build chain.

## Quick Start (Desktop)

From this folder:

```bash
npx serve .
```

Open `http://localhost:3000` in Chrome, Firefox, or Edge.

## Running on Meta Quest 3 (WebXR requires HTTPS or `localhost`)

WebXR (`navigator.xr`) is only enabled in secure contexts (`https://` or `http://localhost`):

### Option A — GitHub Pages (wireless, automatic HTTPS)
Open `https://cachemarra.github.io/GaussianWorlds/neon-high/` in **Quest Browser** and press **Enter VR**.

### Option B — `adb reverse` over USB (fastest for local development)
1. Connect the Quest 3 via USB with USB debugging enabled.
2. Serve this folder on your Mac/PC:
   ```bash
   npx serve -l 3000 .
   ```
3. Forward the port to the headset:
   ```bash
   adb reverse tcp:3000 tcp:3000
   ```
4. In **Quest Browser**, open `http://localhost:3000` and press **Enter VR**.

### Option C — Local LAN HTTPS (with `mkcert`)
1. Generate a local certificate: `mkcert <your-local-ip>` (and install the CA on the headset if needed).
2. Serve over TLS:
   ```bash
   npx serve --ssl-cert <cert.pem> --ssl-key <key.pem> -l 3443 .
   ```

## Biomes & Exploration

All biomes coexist within the same continuous world (walk between them or teleport via keys `1–7` or the menu):

- **`1` — Meadow**: Gentle rolling hills, wind-animated grass and wildflowers, directional lighting, ambient occlusion on trunks/grass, trees, rocks, rivers, lakes with shoreline foam, stone wells, butterflies, rabbits, and birds/fireflies.
- **`2` — Conifer Forest**: Tall straight and twisted pines, mossy fallen logs, stumps, dark forest floor, streams, lakes, wells, deer, and birds.
- **`3` — Cave**: Underground rocky vault with varying ceiling height (tight tunnels and tall caverns), stalactites, stalagmites, mineral pools, bioluminescent crystals casting ground glow, and bats. Psychological encounters stay active even during daytime.
- **`4` — Sea**: Sandy beach with specular reflection and shoreline foam (**2DGS** surface), plus an underwater reef where you can swim and **dive** among kelp, corals, schools of fish, and jellyfish.
- **`5` — Liminal Space**: Crisp **2DGS** architecture, variable ceiling heights (`3.4 m / 4.6 m / 7.0 m`), pillars, damp stains, chairs facing walls, subtly flickering hanging fluorescents, impossible staircases, **dimensional doors**, and gaze-triggered phantom doors that appear when you turn around. Psychological encounters stay active even during daytime.
- **`6` — Dreamcore**: Balanced-exposure pastel hills, low pastel cloud banks, cotton trees, floating **2DGS** stairs, winged eyes, and floating orbs.
- **`7` — Terrorcore**: Dark ash terrain with crimson veins, red eclipse, obsidian rib arches, dead trees with red fissures, watchful eyes in the fog, and shadowy specters. Psychological encounters stay active even during daytime.

Each biome also hides a unique **Anomaly / Resonator (`0 / 7`)**: get close (`< 4.5 m`) to tune its spatial harmonic chord.

## Splat Quality Presets

Switch splat density from the menu (`Tab` or VR menu) or with the **`Q`** key:
- **Default**: ~95k–115k visible splats (180k cap), tuned for smooth Quest 3 performance (~90 fps).
- **High (300k)**: Higher density and finer splats, capped at `300,000` visible splats.
- **ULTRAX (500k)**: Maximum detail and expanded chunk radius, up to `500,000` visible splats.

## Controls

### Desktop
- **Click scene**: Enable Pointer Lock (mouse look) + unlock WebAudio
- **`WASD` / Arrow keys**: Move (`Shift` to sprint; underwater, swim toward look direction)
- **`Space`**: Jump on land / swim up underwater
- **`C` / `Left Ctrl`**: Dive down underwater
- **`L`**: Toggle GPU flashlight
- **`Tab`** (or **Menu** button): Open/close settings menu (biomes, quality, collisions, controls guide)
- **`1`–`7`**: Teleport across all 7 biomes
- **`Q`**: Cycle splat quality (`Default` → `High (300k)` → `ULTRAX (500k)`)
- **`N`**: Toggle Day / Night
- **`F`**: Trigger psychological encounter (cycles `peripheral` / `false_alarm` / `stalker`; forces night in daytime biomes)
- **`T`**: Pause / resume day-night cycle
- **`M`**: Mute / unmute audio (generative relaxing daytime / uncanny nocturnal or dark-biome music, surface-specific footsteps, portals, anomaly chords, and encounters)
- **`H`**: Show / hide HUD

### Meta Quest 3 (WebXR)
- **Visible hands**: Stylized controller models + physical flashlight beam on the right hand + laser pointer when the menu is open
- **Left stick**: Move in gaze direction (respecting snap turns; full 3D movement underwater)
- **Right stick (left/right)**: 30° snap turn around the head axis
- **Right `A` button**: Jump / swim up
- **Left `X` button**: Dive down underwater
- **Right side grip**: Toggle right-hand flashlight
- **Left side grip**: Toggle 3D floating menu (biomes, flashlight, day/night, event, audio, collisions, controls)
- **Trigger**: Select button in the 3D menu
- **Left `Y` / Right `B`**: Quick shortcuts for Day-Night / Night event
- **Object collisions**: Trunks, rocks, wells (jumpable), stalagmites, crystals, and corals use analytical collision toggleable from the menu
- **VR HUD**: Floats in the lower-left field of view showing `FPS`, `Splats`, `Biome`, `Phase`, `Event`, and menu hint.

## Known Risks
- **Overdraw / fill-rate on Quest 3**: Heavy overlapping large Gaussians (grass + tree canopies) in stereo rendering can bottleneck the mobile GPU before hitting the splat count cap.
- **Per-frame `updateVersion()` cost**: Wind animation via `dyno` re-evaluates active chunk generators each frame; on mobile, disable wind on distant chunks if frame time rises.
- **Audio blocked until first gesture**: Browsers (including Quest Browser) mute WebAudio until the first click/tap; click the page or press **Enter VR** to enable spatial footsteps and audio cues.
- **`float16` precision**: Spark packs splat centers in `float16`; mitigated via `localFrame` and chunk-local coordinates, though traveling thousands of meters from origin may eventually require recentering.

## First 3 Performance Tweaks for Quest 3

All parameters live in `config.js`:

1. **Lower budget and chunk radius**: Reduce `MAX_VISIBLE_SPLATS` (e.g., `300_000` → `150_000`) and `CHUNK_RADIUS` from `3` to `2`.
2. **More aggressive LOD**: Pull transitions closer in `LOD_THRESHOLDS` (e.g., `lod0In: 0.9, lod0Out: 1.1, lod1In: 1.7, lod1Out: 1.9`) or reduce `grassCount` in `LOD_SETTINGS[0]` (`chunks.js`).
3. **Tune `SparkRenderer`**: Lower `SPARK_MAX_STD_DEV` to `Math.sqrt(4)` in `config.js` and add `minSortIntervalMs: 33` in `new SparkRenderer({ ... })` (`main.js`).
