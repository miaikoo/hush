# HUSH

A first-person psychological horror mini game built with **Three.js**.
UTS Grafika Komputer — *Three.js Interactive 3D Project* · Topic: **Interactive Haunted House** · Category: **Mini Game 3D**

> *14 Hollow Lane. Empty for years. Routine job: inspect it before Monday's sale.*

You are a home inspector locked inside an empty house. There is no monster. The only enemy is your
**Fear**: it rises in the dark and distorts how the world is rendered, from flickering lights and
drained colors to shapes at the edge of your vision and objects that aren't really there.
Restore the power, find the spare key, and get out. Or so you think.

---

## Running the project

Requirements: Node.js 18+.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build in dist/
npm run preview   # serve the production build
```

Headphones are recommended: all sound is positional.

### Controls

| Input | Action |
|---|---|
| Mouse | Look |
| W A S D | Move |
| E / Left click | Interact (inspect, take, open, activate) |
| F | Toggle flashlight |
| Hold Space | Breathe (lowers fear, but you can't move) |
| Esc | Pause |

---

## How to play

Follow the inspection checklist in the top-left corner:

1. **Check main entrance:** the front door is locked.
2. **Locate a light source:** there's a flashlight in the pocket of a coat that looks like yours.
3. **Find a replacement fuse:** a note in the library tells you where.
4. **Restore power:** the fuse box is at the end of the hallway.
5. **Find the spare key:** in the study. Several keys appear, but only one is real.
   *If it has no shadow, it isn't there.*
6. **Leave.**

**Fear (0–100):** rises in the dark, when you stare at the portrait, during unsettling events and
when you touch hallucinations. It falls in lit rooms, while you breathe, near the radio, and when
you look at the family photo. At **100** you collapse and lose. Fear tiers progressively add
flicker, fog, vignette, desaturation, chromatic aberration, shadow figures, heartbeat audio,
camera sway and objects that move while you're not looking.

**Win:** unlock the front door and escape. **Lose:** fear reaches 100. Both endings bring you back
to the start, and the house remembers how many times you've been there.

---

## Computer graphics concepts used

| Requirement | Implementation | Where |
|---|---|---|
| Scene, camera, renderer | `WebGLRenderer` (ACES tone mapping, sRGB), `PerspectiveCamera`, render loop with `THREE.Timer` | `src/scene.js`, `src/main.js` |
| Environment | Indoor house built from geometry, `FogExp2` (density driven by fear), HDRI environment map (PMREM) for PBR reflections, night sky seen through the window | `src/house.js`, `src/scene.js` |
| Geometry / material / mesh | Walls with door/window openings generated from `BoxGeometry` with world-space UVs; procedural props (key, music box, coat rack, fuse, bulbs…); every library book is one `InstancedMesh` (1 draw call) | `src/house.js`, `src/props.js` |
| Scene graph (parent–child) | `head → camera → flashlight (SpotLight) + hand model`; `doorPivot → door → knobs`; `musicBox → lidPivot → lid`; `rockPivot → chair` | `src/player.js`, `src/doors.js`, `src/props.js` |
| GLTF / GLB | 21 furniture/prop models loaded with `GLTFLoader` | `src/assets.js` |
| PBR material | `MeshStandardMaterial` with color/roughness/normal maps; metallic brass key and knobs reflect the HDRI | `src/house.js`, `src/props.js` |
| Lighting | Hemisphere (ambient), moonlight `SpotLight` through the window, flashlight `SpotLight`, `PointLight` lamps with emissive bulbs, a flickering hallway lamp | `src/scene.js`, `src/animation.js` |
| Shadow | Flashlight and moonlight cast shadows (window cross pattern on the floor). **Shadows are the core puzzle:** hallucinated keys have `castShadow = false` | `src/player.js`, `src/game.js` |
| Animation (6+) | Door swings (tweens), fuse box door (`AnimationMixer` + authored `AnimationClip`), light flicker (noise), music box lid + dancer, rocking chair, clock hands, cinematic ending camera | `src/animation.js`, `src/game.js` |
| Raycasting | `THREE.Raycaster` from the screen center for every hover/interaction (walls occlude); downward raycasts place items on furniture surfaces and find bookshelf shelves | `src/interaction.js`, `src/props.js` |
| Interaction (15+) | Open doors, inspect notes/photo/portrait (3D inspect view), collect flashlight/fuse/key/batteries, flip light switches, light lamps, radio, fuse box, music box | `src/game.js` |
| Visual feedback | Hover highlight (emissive), prompts, rattle shake, sparks, dissolve, lamp glow, screen effects | `src/interaction.js`, `src/effects.js` |
| VFX | Post-processing fear shader (vignette, desaturation, chromatic aberration, grain, warp), dust particles lit only inside the flashlight cone (custom `ShaderMaterial`), fuse sparks (`Points`), dissolve shader (`onBeforeCompile`), peripheral shadow figures, emissive portrait eyes | `src/effects.js`, `src/hallucinations.js` |
| Camera & projection | First-person `PointerLockControls`, head bob, fear-driven sway and FOV warp; `THREE.Frustum` decides when objects may move unseen; shadow figures spawn inside the horizontal FOV edge | `src/player.js`, `src/hallucinations.js` |
| UI / HUD | Inspection clipboard (objectives), fear meter, battery, inventory, prompts, title/intro/pause/end screens | `src/ui.js`, `src/style.css` |
| Win / Lose / Restart | Escape → loop; fear 100 → collapse → loop; Play again / Title | `src/game.js` |
| Audio | All sounds synthesized in code (Web Audio buffers) and played via `AudioListener` / `PositionalAudio` | `src/audio.js` |

### Performance

- Only **2 shadow-casting lights** (flashlight, moonlight). Lamps are short-range `PointLight`s without shadows, sized so they don't leak through walls.
- All walls are merged into a single mesh (1 draw call); all books are one `InstancedMesh`.
  The first version used a downloaded book model at ~44k triangles per book, which made the library
  cost 1,090 draw calls and 1.9M triangles per frame. Instancing brought it to 61 draw calls and 139k triangles.
- A warm-up pass behind the loading screen uploads every texture and compiles every shader variant,
  so the first look at an object doesn't freeze the game (it was a 7 s freeze before).
- Adaptive resolution lowers the render scale when the frame rate stays low (toggle the FPS readout with <kbd>`</kbd>).
- 1K textures. Raycasts only test registered interactables plus walls.
- Shaders are precompiled with `renderer.compileAsync` before the first frame.
- Pixel ratio capped at 2.

---

## Project structure

```
src/
├── main.js           bootstrap, render loop, debug mode
├── config.js         rooms, tuning values, fear tiers
├── scene.js          renderer, scene, fog, environment, base lights
├── assets.js         GLTF / texture / HDR loading
├── house.js          walls, openings, floor, ceiling, window
├── props.js          furniture placement + procedural story props
├── doors.js          hinged door (scene graph + animation)
├── player.js         first-person controller, collision, flashlight
├── interaction.js    raycaster interaction + inspect view
├── game.js           state machine, objectives, interactions, endings
├── fear.js           fear meter
├── hallucinations.js shadow figures, off-screen shifts, random events
├── animation.js      tweens, flicker, animation clips
├── effects.js        post-processing, dust, sparks, dissolve
├── audio.js          procedural sound
├── textures.js       canvas-generated textures (notes, portrait, photo…)
├── ui.js / style.css HUD and screens
public/
├── models/           glTF models (Poly Haven)
├── textures/         PBR texture sets (Poly Haven)
└── environments/     HDRI (Poly Haven)
```

The design document with the full concept and requirement traceability is in [DESIGN.md](DESIGN.md).

### Debug mode

`http://localhost:5173/?debug` skips the menus. Options: `&cam=x,z,yawDeg[,pitchDeg]`, `&fear=60`
(hold fear), `&power`, `&flash`, `&lamps`, `&keys`, `&real=0..3`.

---

## Originality

All source code, the scene composition, the gameplay/interaction/animation logic, the UI, the
shaders, the procedural textures and every sound were written for this project. No game
template or existing project was used as a base. External content is limited to the CC0 assets
listed below.

## Asset Credits

All 3D models, textures and the HDRI come from [Poly Haven](https://polyhaven.com) under the
**CC0** license (public domain).

| Asset | Author(s) | Source | License |
|---|---|---|---|
| Arm Chair 01 | Kirill Sannikov | [polyhaven.com/a/ArmChair_01](https://polyhaven.com/a/ArmChair_01) | CC0 |
| Chandelier 01 | Kirill Sannikov | [polyhaven.com/a/Chandelier_01](https://polyhaven.com/a/Chandelier_01) | CC0 |
| Classic Console 01 | Kirill Sannikov | [polyhaven.com/a/ClassicConsole_01](https://polyhaven.com/a/ClassicConsole_01) | CC0 |
| Clipboard | ProgrammerOnCoffee | [polyhaven.com/a/clipboard](https://polyhaven.com/a/clipboard) | CC0 |
| Dark Paneled Wood | Dimitrios Savva | [polyhaven.com/a/dark_paneled_wood](https://polyhaven.com/a/dark_paneled_wood) | CC0 |
| Decrepit Wallpaper | Rob Tuytel | [polyhaven.com/a/decrepit_wallpaper](https://polyhaven.com/a/decrepit_wallpaper) | CC0 |
| Dining Chair 02 | James Ray Cock | [polyhaven.com/a/dining_chair_02](https://polyhaven.com/a/dining_chair_02) | CC0 |
| Dirty Carpet | Rohit Seervi | [polyhaven.com/a/dirty_carpet](https://polyhaven.com/a/dirty_carpet) | CC0 |
| Fancy Picture Frame 01 | Rob Tuytel, Rico Cilliers | [polyhaven.com/a/fancy_picture_frame_01](https://polyhaven.com/a/fancy_picture_frame_01) | CC0 |
| Gothic Commode 01 | Kirill Sannikov | [polyhaven.com/a/GothicCommode_01](https://polyhaven.com/a/GothicCommode_01) | CC0 |
| Hanging Picture Frame 01 | James Ray Cock | [polyhaven.com/a/hanging_picture_frame_01](https://polyhaven.com/a/hanging_picture_frame_01) | CC0 |
| Hanging Picture Frame 02 | James Ray Cock | [polyhaven.com/a/hanging_picture_frame_02](https://polyhaven.com/a/hanging_picture_frame_02) | CC0 |
| Old Room (HDRI) | Sergej Majboroda | [polyhaven.com/a/old_room](https://polyhaven.com/a/old_room) | CC0 |
| Old Wood Floor | Guillaume Monsergent | [polyhaven.com/a/old_wood_floor](https://polyhaven.com/a/old_wood_floor) | CC0 |
| Ornate Mirror 01 | James Ray Cock | [polyhaven.com/a/ornate_mirror_01](https://polyhaven.com/a/ornate_mirror_01) | CC0 |
| Power Box 01 | Rico Cilliers, Yann Kervran | [polyhaven.com/a/power_box_01](https://polyhaven.com/a/power_box_01) | CC0 |
| Rockingchair 01 | Jorge Camacho | [polyhaven.com/a/Rockingchair_01](https://polyhaven.com/a/Rockingchair_01) | CC0 |
| Rough Pine Door | Dimitrios Savva | [polyhaven.com/a/rough_pine_door](https://polyhaven.com/a/rough_pine_door) | CC0 |
| Side Table 01 | James Ray Cock | [polyhaven.com/a/side_table_01](https://polyhaven.com/a/side_table_01) | CC0 |
| Standing Picture Frame 01 | James Ray Cock | [polyhaven.com/a/standing_picture_frame_01](https://polyhaven.com/a/standing_picture_frame_01) | CC0 |
| Vintage Flashlight | Omar M. El-Safy | [polyhaven.com/a/vintage_flashlight](https://polyhaven.com/a/vintage_flashlight) | CC0 |
| Vintage Grandfather Clock 01 | Yann Kervran, James Ray Cock | [polyhaven.com/a/vintage_grandfather_clock_01](https://polyhaven.com/a/vintage_grandfather_clock_01) | CC0 |
| Vintage Oil Lamp | Monsta3D | [polyhaven.com/a/vintage_oil_lamp](https://polyhaven.com/a/vintage_oil_lamp) | CC0 |
| Vintage Radio Transceiver | Mateusz Sadek | [polyhaven.com/a/vintage_radio_transceiver](https://polyhaven.com/a/vintage_radio_transceiver) | CC0 |
| Vintage Wooden Drawer 01 | James Ray Cock | [polyhaven.com/a/vintage_wooden_drawer_01](https://polyhaven.com/a/vintage_wooden_drawer_01) | CC0 |
| Wooden Bookshelf Worn | Ulan Cabanilla | [polyhaven.com/a/wooden_bookshelf_worn](https://polyhaven.com/a/wooden_bookshelf_worn) | CC0 |
| Wooden Table 02 | Serhii Khromov | [polyhaven.com/a/wooden_table_02](https://polyhaven.com/a/wooden_table_02) | CC0 |
| Worn Plaster Wall | Dimitrios Savva | [polyhaven.com/a/worn_plaster_wall](https://polyhaven.com/a/worn_plaster_wall) | CC0 |

**Fonts:** [Special Elite](https://fonts.google.com/specimen/Special+Elite) (Astigmatic) and
[Caveat](https://fonts.google.com/specimen/Caveat) (Impallari Type) via Google Fonts, SIL Open Font License.

**Audio:** none external. Every sound is synthesized at runtime in `src/audio.js`.

**Library:** [three.js](https://threejs.org) (MIT License).

The machine-readable list of downloaded assets is in `assets-credits.json`.
