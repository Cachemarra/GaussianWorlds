# GaussianWorlds — Procedural Gaussian Splatting Benchmark (Neon High vs. Opus 5.5)

An experimental comparison of procedural 3D world generation built **entirely from Gaussian Splats** (no external 3D meshes or scans), powered by **Three.js (`0.180.0`)** and **Spark (`@sparkjsdev/spark@2.4.0`)** via CDN with zero build chain, targeting both **Desktop** and **Meta Quest 3 (WebXR)**.

> **Important note on comparison fairness:** This project started as a head-to-head test between **Gemini (Neon High)** and **Claude (Opus 5.5)**. However, the two folders are **not** at equal prompt depth:
> - **`opus-5.5/`** was generated at the milestone of **iteration 4**, using the accumulated set of requirements up to that stage.
> - **`neon-high/`** continued evolving through **7 distinct iterations** (including Quest 3 playtest feedback and a parallel multi-agent upgrade pass). The original `v0` snapshot of Neon High was not tracked in git, so only the final iterated build is stored here.

---

## Live Demos (GitHub Pages)

Both builds are static HTML/JS apps and run directly in the browser (HTTPS enabled for Meta Quest 3 WebXR):

| Model / Folder | Live Demo | Details |
| :--- | :--- | :--- |
| **Gemini — Neon High** ([`neon-high/`](./neon-high/)) | [Launch Neon High Demo](https://cachemarra.github.io/GaussianWorlds/neon-high/) | 7 iterations · 3 parallel subagents · 7 biomes · 3 splat presets · VR menu & flashlight |
| **Claude — Opus 5.5** ([`opus-5.5/`](./opus-5.5/)) | [Launch Opus 5.5 Demo](https://cachemarra.github.io/GaussianWorlds/opus-5.5/) | Launched at iteration 4 (accumulated spec) · 4 biomes · URL-configurable budget · Playwright headless test |

---

## Side-by-Side Overview

| Aspect | `neon-high/` (Gemini Neon High) | `opus-5.5/` (Claude Opus 5.5) |
| :--- | :--- | :--- |
| **Generation History** | 7 distinct iterations (8 raw prompts; initial prompt sent twice) | Single consolidated run with requirements accumulated through iteration 4 |
| **Subagents Used** | 3 parallel subagents (during iteration 7) | None |
| **Biomes** | 7 (Meadow, Conifer Forest, Cave, Sea, Liminal, Dreamcore, Terrorcore) | 4 (Meadow, Conifer Forest, Cave, Sea) |
| **Rendering & Visuals** | 2DGS architecture & water, directional lighting/AO, GPU/VR flashlight, quality presets (`Default`, `High 300k`, `ULTRAX 500k`) | Dynamic chunked splats with URL tuning (`?budget=`, `?radius=`, `?seed=`, `?day=`), GPU wind & wave animation |
| **Audio & Events** | Generative day/night & dark-biome music, surface footsteps, 3-mode horror director (`peripheral` / `false_alarm` / `stalker`), Liminal gaze-triggered doors, 7 biome anomalies | Procedural piano/flute music, day/night ambience, spatial footsteps & peripheral night figure (`pop` on gaze) |
| **VR / Controls** | Quest 3 WebXR with visible hands, physical flashlight, 3D floating menu, snap turn, analytical object collisions | Quest 3 WebXR with floating HUD panel, snap turn, diving, heightfield & low-ceiling collisions |
| **Automated Verification** | Desktop + Quest 3 playtest iterations | Headless Chromium Playwright script (`opus-5.5/test/headless.cjs`) + screenshots (`opus-5.5/test/capturas.png`) |

---

## Gemini (Neon High) Iteration & Subagent Log

### Iterations (7 distinct iterations)
*8 raw user messages were sent in total (the initial prompt was submitted twice back-to-back):*

1. **Initial PoC** — Meadow procedural world, Spark splats, day/night cycle, wind, spatial night-figure event, Desktop + Quest 3 WebXR.
2. **Ambient audio & music** — Background nature and nocturnal accompaniment.
3. **3 new biomes + movement** — Conifer forest, Cave, Sea (with diving), water bodies, footsteps, and jumping.
4. **Quest 3 playtest feedback** — Stricter peripheral event angle, VR hands + 3D floating menu, left-stick heading fix, and object collisions. *(Claude Opus 5.5 was launched at this stage with the accumulated requirements.)*
5. **3 surreal biomes + life + quality** — Liminal, Dreamcore, Terrorcore, creatures, `High (300k)` / `ULTRAX (500k)` presets, relaxing/uncanny generative music, and fixed sky dome.
6. **Design review** — Brainstorming visual quality and gameplay improvements.
7. **Final upgrade pass** — Directional lighting/AO, 2DGS architecture & water, GPU/VR flashlight, 3-mode horror director, Liminal gaze-triggered doors, and 7 biome anomalies.

### Subagents Launched (3 total — all in parallel during iteration 7)

1. **Visual World Engineer** — `terrain.js`, `sky.js`, `chunks.js`
2. **Horror and Audio Engineer** — `nightEvent.js`, `audio.js`
3. **Anomalies and VR Menu Engineer** — `anomalies.js`, `vrMenu.js`

---

## Running Locally

No build step is required. From the repository root:

```bash
npx serve .
```

Then open:
- `http://localhost:3000/neon-high/`
- `http://localhost:3000/opus-5.5/`

Open each subfolder (`neon-high/` or `opus-5.5/`) for full biome documentation, controls, Quest 3 setup, and performance tuning notes.
