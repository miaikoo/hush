# HUSH — Design Document

> UTS Grafika Komputer — Three.js Interactive 3D Project
> Category: **A. Mini Game 3D** · Topic: **Interactive Haunted House**
> Deadline: ~2026-10-24 (two weeks from 2026-10-10)

---

## 1. Concept

**HUSH** is a first-person psychological horror mini game. There is no monster and no jumpscare.
The only enemy is the player's own **Fear**. As fear rises, the rendering of the world itself
starts to break down: lights flicker, colors drain, shapes appear at the edge of vision, and
objects that aren't real appear in the house.

**One-line pitch:** A home inspector is locked inside an empty house that feels more familiar the
longer they stay. They manage fear with light and breathing, use shadows to tell what's real from
hallucinations, and escape — into a loop.

### Design pillars
1. **Fear is a graphics system.** Every hallucination is built from course material: lighting,
   shadow, shaders, camera, fog.
2. **Unsettling, not startling.** Things happen at the corner of the eye, slowly, quietly. Nothing
   jumps at the player.
3. **Never fully explained.** The story is told through objects and details, not text dumps.

---

## 2. Story

**Setup (shown on the intro card):**
> *14 Hollow Lane. Empty for years.*
> *Routine job: inspect it before Monday's sale.*

The player is a home inspector who believes this is their first visit. The game starts **inside
the Foyer, facing the front door** — it's locked, and they don't remember it closing.

While searching for a way out, details become familiar in a way they shouldn't be:

| Cue | Where |
|---|---|
| A coat on the rack exactly like the player's own (the flashlight is in its pocket) | Foyer |
| Notes written in the player's own handwriting, with hints they haven't figured out yet | Library, Study |
| Family photos with one face always scratched out | Hallway |
| Tally marks scratched into the wall — one per completed loop | Hallway, by the fuse box |
| Muddy footprints leading where the player is about to go | Hallway floor (decal) |

**Ending:** the player finds the key and escapes… and wakes up in the Foyer, facing the locked
door. *"You escaped. Didn't you?"* Nothing is ever explained further.

### Notes (in-game text)
| Note | Location | Text |
|---|---|---|
| Desk note | Library | *"Third shelf. Behind the red books. You always forget."* |
| Study note | Study | *"If it has no shadow, it isn't there."* (tutorial for the core mechanic) |
| Front door (on first click) | Foyer | *"Locked. You don't remember it closing."* |

---

## 3. Core Loop & Game Flow

```
TITLE ──Start──▶ INTRO CARD ──▶ PLAYING ◀──▶ INSPECTING / PAUSED
                                   │
                ┌──────────────────┴──────────────────┐
           fear = 100                         front door unlocked
                │                                      │
          LOSE SEQUENCE                         WIN SEQUENCE
     "YOU LOST YOURSELF"                       "YOU ESCAPED"
          "Not yet."                    "You escaped. Didn't you?"
                │                          (tally marks +1)
                └──────────────┬───────────────────────┘
                       [Play Again] / [Title]
```

Matches the required Mini Game structure (slide 13):
**START → PLAY → INTERACTION → OBJECTIVE / CHALLENGE → WIN / LOSE → RESTART.**

### Objective chain (the inspection checklist — shown as the HUD clipboard)

```
14 HOLLOW LANE — INSPECTION
☐ Restore power        → flashlight (coat) → desk note → red books → fuse → fuse box
FOYER     ☐ Mirror  ☐ Clock
HALLWAY   ☐ Portrait  ☐ Family photo  ☐ Painting  ☐ Wall damage (= tally marks)
LIBRARY   ☐ Radio  ☐ Reading desk (= the note)  ☐ Bookshelf (= move the red books)
STUDY     ☐ Rocking chair  ☐ Music box  ☐ Writing desk (= the note)   (study opens once the power is back)
☐ Leave                → appears when the form is complete
  front door locked. from OUTSIDE?   ← your pen note, when you find the door locked
☐ find a spare key     → Study (real key among hallucinated fakes)
```

The HUD form lists the items by name, worded like a real inspection form (playtesters found "0/2"
counts unintuitive), but never says where they are or how to reach them; the notes in parentheses
and the power chain are for this document only. The player doesn't discover the lock until the job is done, so the
first half is calm and uneasy and the lock-in lands as a reveal.

> **As built:** the step-by-step script below is the original plan; the order changed to the inspection
> form above (lock discovered at the end of the job, keys appear only after that).

### Step-by-step script
1. **Foyer (start).** Dark, only moonlight through a window. Player clicks the front door: locked,
   fear +5. *Tick 1.*
2. **Coat rack.** Player takes the flashlight from the coat pocket. *Tick 2.* Flashlight
   controls appear in the HUD.
3. **Library.** Door opens with an animated swing. The desk note points to the bookshelf.
   Searching the shelf reveals the fuse. *Tick 3.* A radio here can be switched on (calming).
4. **Hallway.** The fuse box hums. Insert the fuse: **power restored**. Lamps light up, the
   hallway lamp keeps flickering, and lamp switches in every room now work. *Tick 4.*
   The tally marks next to the fuse box are now visible in the light.
5. **Study.** Its door, stuck until now, **slowly creaks open on its own** once power returns
   (unsettling, not startling). Inside: the music box and the second note. When the player
   enters for the key step, the Study lamp goes out, the music box starts playing by itself
   (fear +15), and **one real key plus three hallucinated keys** appear. Only the real one casts
   a shadow under the flashlight. Picking a fake: it dissolves, fear +15. *Tick 5* on the real key.
6. **Foyer.** Use the key on the front door → win sequence. *Tick 6.*

---

## 4. Controls

| Input | Action |
|---|---|
| Mouse | Look (Pointer Lock) |
| W A S D | Move |
| Left click / E | Interact with the highlighted object |
| F | Toggle flashlight |
| Hold Space | Breathe (calm down — cannot move while breathing) |
| Esc | Pause (releases pointer) |

---

## 5. Mechanics

### 5.1 Fear meter (0–100)
Starts at **10**. At **100** the player loses. All values are **starting points for tuning**.

| Source | Effect |
|---|---|
| In an unlit room, flashlight off / dead | **+3.0 / s** |
| In an unlit room, flashlight on | **+0.8 / s** |
| In a lit room (power on + lamp on) | **−2.0 / s** |
| Breathing (hold Space, after 1 s wind-up) | **−6.0 / s** |
| Radio playing, while in the Library | **−1.0 / s** extra |
| Inspecting the family photo (once per loop) | **−10** |
| Staring at the portrait (eyes on screen center) | **+2.0 / s** |
| Scripted event (locked door, music box) | **+5 to +15** |
| Picking up a hallucinated object | **+15** |
| Random event (see 5.5) | **+3 to +8** |

"Lit room" is decided per room zone (axis-aligned box), not per light. This is cheaper and
easier to reason about.

### 5.2 Fear tiers → hallucinations

| Fear | State | Effects |
|---|---|---|
| 0–25 | **Calm** | Dust particles in the flashlight beam, normal lighting |
| 25–50 | **Uneasy** | Flicker gets more frequent, fog thickens, faint whispers, portrait eyes start to glow |
| 50–75 | **Disturbed** | Vignette closes in, desaturation, shadow figures in peripheral vision, objects shift while off-screen |
| 75–100 | **Panic** | Chromatic aberration, film grain, heartbeat audio, camera sway, FOV warps, hallucinated objects appear |
| 100 | **Collapse** | Lose sequence |

Effects scale smoothly with the fear value (shader uniforms), and the tiers mark when new
effect types switch on.

### 5.3 Flashlight & battery
- A `SpotLight` that is a **child of the camera** (scene-graph requirement).
- The battery starts at **100** and drains **0.6 / s** while on (≈ 2.8 minutes).
- Below 20 it stutters, and at 0 it goes off.
- There are **3 batteries** in the house (Foyer drawer, Library, Hallway), +40 each.
- The flashlight is one of the two shadow-casting lights (see §9).

### 5.4 Breathing
- Hold Space. Movement is locked, the camera slowly bobs, and breathing audio plays.
- After a 1-second wind-up, fear drops 6 per second.
- **The trade-off:** you stand still while the battery drains and events keep happening.

### 5.5 Hallucinations & events
| Name | How it works | Course concept |
|---|---|---|
| **Fake objects** | At the key step (and any time fear ≥ 75), copies of objects spawn with `castShadow = false`. Picking one up plays a dissolve shader and adds fear. | Shadow mapping |
| **Shadow figures** | A dark silhouette (transparent billboard plane) spawns 50–70° off the view direction and fades out when the player looks toward it (`dot(viewDir, toFigure) > cos 25°`). | Camera / vectors / transparency |
| **Off-screen shifts** | Objects that are outside the camera `Frustum` can turn or move: a chair faces the player, a door that was closed is open. *(Nice-to-have.)* | Camera & projection |
| **Portrait eyes** | Emissive eyes on a portrait, with intensity rising with fear. *(Nice-to-have: they follow the player.)* | Emissive material |
| **Random event pool** | Every 20–40 s, roll for an event weighted by tier: lamp flicker burst, distant door creak, footsteps above, faint music box, whisper. | — |

### 5.6 Win / Lose / Restart
- **Win:** the key is used on the front door. The door swings open and the cinematic camera
  dollies toward the doorway while white light floods in (exposure and fog color ramp to
  white). **"YOU ESCAPED"** appears, then fade to black, fade in to the Foyer facing the locked door, and the text
  *"You escaped. Didn't you?"* Then **HUSH**, with **[Play Again]** and **[Title]**.
  The loop count goes up by 1.
- **Lose:** fear reaches 100. The vignette closes completely, the heartbeat stops, and the
  screen goes black. **"YOU LOST YOURSELF"**, then *"Not yet."*, then **[Play Again]** and **[Title]**. The loop count does not change.
- **Restart:** resets all game state (fear, battery, checklist, doors, lights, items,
  hallucinations). The only thing that persists is the loop count.

### 5.7 Loop memory (persists via `localStorage`)
- Tally marks on the hallway wall = number of completed loops.
- *(Nice-to-have)* Loop ≥ 1: checklist item 1 is pre-ticked in unfamiliar handwriting.
  Loop ≥ 2: the notes become more desperate (*"STOP OPENING THE DOOR"*).
- All storage access is wrapped in try/catch, and the game works fine without it.

---

## 6. World Layout

Ceiling height 3 m. Walls, floors and ceilings are **built in code** from `BoxGeometry` and
`PlaneGeometry` with PBR textures. Furniture and props are GLB.

```
        ┌───────────┐     ┌───────────┐
        │  LIBRARY  │     │   STUDY   │
        │   6 × 6   │     │   5 × 5   │
        │ desk,note │     │ music box │
        │ bookshelf │     │ keys,note │
        │   radio   │     │  armchair │
        └─────┬─────┘     └─────┬─────┘
          [door]             [door]
   ┌──────────┴─────────────────┴──────────┐
   │               HALLWAY  12 × 3         │
   │  fuse box · tally marks · portrait    │
   │  family photo · flickering lamp       │
   └──────────┬────────────────────────────┘
          (archway)
        ┌─────┴─────┐
        │   FOYER   │  window (moonlight)
        │   6 × 6   │  coat rack, side table
        │ [FRONT    │  
        │   DOOR]   │  ← start, facing this
        └───────────┘
```

---

## 7. Interactive Objects

Hovering any interactive object shows the crosshair change, a prompt (e.g. `[E] Open`) and a
subtle emissive highlight.

| # | Object | Room | Interaction type | Feedback |
|---|---|---|---|---|
| 1 | Front door | Foyer | Click door (locked, then unlock) | Rattle shake, message; door swing on win |
| 2 | Coat → flashlight | Foyer | Collect | Item added to HUD, flashlight available |
| 3 | Library door | Hallway | Click door | Animated hinge swing + creak |
| 4 | Desk note | Library | Inspect | Close-up view + note text panel |
| 5 | Bookshelf → fuse | Library | Inspect / collect | Books shift, fuse added to HUD |
| 6 | Radio | Library | Activate | Soft music, small emissive dial glow |
| 7 | Fuse box | Hallway | Use item | Sparks, power-on sequence, lamps light up |
| 8 | Lamp switches | All rooms | Activate lamp | Light + emissive bulb on/off |
| 9 | Family photo | Hallway | Inspect | Close-up, fear −10 |
| 10 | Study door | Hallway | Trigger event (opens itself) | Slow creak swing |
| 11 | Music box | Study | Trigger event | Lid opens, melody, fear spike |
| 12 | Keys (1 real, 3 fake) | Study | Collect | Real: added to HUD. Fake: dissolve + fear |
| 13 | Batteries | Various | Collect | Battery bar refills |

That's 13 objects against a requirement of 5. The spec's suggested interactions (click door,
inspect object, activate lamp, collect key, trigger event) are all covered.

**Inspect mode:** a clone of the object is placed in front of the camera, slowly rotates and can
be turned with the mouse, while the text panel shows. Controls are locked. Esc or click closes it.

---

## 8. Visual Design

### 8.1 Lighting
| Light | Type | Role |
|---|---|---|
| Ambient fill | `HemisphereLight` (very low, cold blue/dark brown) | Keeps the darkness readable without lighting the scene |
| Moonlight | `SpotLight` outside the window (blue, **casts shadow**); a spot keeps the light inside its cone so it can't leak into other rooms | Window light in the Foyer, gives window-frame shadows |
| Flashlight | `SpotLight` (warm, child of camera, **casts shadow**) | The player's main light; also drives the shadow mechanic |
| Room lamps | `PointLight` × 4 (warm, no shadow) | Safe zones after power is restored |
| Hallway lamp | `PointLight` with noise-driven intensity | Required flickering light |
| Emissive | Lamp bulbs, radio dial, portrait eyes, fuse box LED | Glow detail |

Renderer: ACES Filmic tone mapping, sRGB output, `PCFSoftShadowMap`.

### 8.2 Environment
- **Indoor scene** with `FogExp2` (near-black). Density rises with fear.
- **Indoor HDRI** as `scene.environment` at low intensity, only so PBR metal (key, doorknobs,
  fuse box) gets believable reflections. The background stays dark.

### 8.3 PBR materials (`MeshStandardMaterial`)
| Surface | Maps | Notes |
|---|---|---|
| Wood floor | color, roughness, normal | Receives shadow |
| Wallpaper | color, roughness, normal | Old, peeling |
| Ceiling plaster | color, roughness | |
| Key / doorknobs | color + metalness 1, low roughness | Shows HDRI reflection |
| Fuse box | metalness 0.6, mid roughness | |

### 8.4 VFX
| VFX | Technique |
|---|---|
| Flickering light | Animated intensity (noise) + matching bulb emissive |
| Fear post-processing | `EffectComposer` + custom `ShaderPass`: vignette, desaturation, chromatic aberration, grain (uniform `uFear`) |
| Dust in the light | `THREE.Points`, additive blending, slow drift |
| Shadow figures | Transparent billboard planes with alpha fade |
| Dissolve (fake objects) | Custom shader / `onBeforeCompile` noise-threshold discard + emissive edge |
| Fuse box sparks | Short-lived `Points` burst |
| Emissive pulse | Portrait eyes, radio dial |
| Camera shake / sway | Procedural camera offset |
| *(Nice-to-have)* Breathing walls | Vertex displacement via `onBeforeCompile` |

### 8.5 Animation
| Animation | Type |
|---|---|
| Door swings (Library, Study, front) | Procedural tween of the hinge pivot rotation |
| Flickering lamp | Procedural light animation |
| Music box lid + spinning figurine | Procedural, or GLB clip via `AnimationMixer` if the asset has one |
| Dissolve, dust, shadow figure fades | VFX animation |
| Win cinematic | Camera path tween |

### 8.6 Scene graph hierarchies
```
camera
└── flashlight (SpotLight)
    └── flashlight.target

doorPivot (Group at the hinge)
└── door (Mesh)
    ├── handleFront
    └── handleBack

houseRoot
├── foyer   (walls, floor, props…)
├── hallway
├── library
└── study
```

### 8.7 Camera
First-person with `PointerLockControls`. Eye height 1.65 m. Simple head bob while walking.
Sway and FOV changes increase with fear. A scripted cinematic camera plays the win sequence.

### 8.8 UI / HUD (HTML/CSS overlay)
- **Clipboard checklist** (top-left): the objective and progress.
- **Fear indicator** (bottom-left): a subtle bar/heartbeat icon. The screen effects carry most of the
  information.
- **Battery bar** (bottom-right, shown once the flashlight is collected).
- **Inventory** (small icons): flashlight, fuse, key.
- **Crosshair + interaction prompt** (center).
- **Screens:** Title, Intro card, Pause, Inspect panel, Win, Lose.
- Font: a typewriter or handwritten Google Font (credited).

### 8.9 Audio
`AudioListener` on the camera. `PositionalAudio` for the music box, radio and fuse box hum.
Global sounds: ambient room tone, breathing, heartbeat (volume tied to fear), door creaks,
whispers, footsteps. Audio unlocks when the player clicks Start.

---

## 9. Performance Budget

| Item | Budget |
|---|---|
| Shadow-casting lights | **2** (flashlight 1024², moonlight 1024²); point lamps never cast shadows |
| Total lights | ≤ 8 |
| Textures | 1K for most, 2K max for the floor/walls |
| Dust particles | ≤ 1,500 |
| Raycast targets | Only the `interactables` list, never the whole scene |
| Pixel ratio | `min(devicePixelRatio, 2)` |
| GLB props | Low-poly packs; reuse geometry/material where possible |
| Target | 60 fps on a mid-range laptop |

---

## 10. Technical Architecture

**Stack:** JavaScript (ES modules), Three.js, HTML, CSS, Vite, npm, Git.
**Official helpers used:** `PointerLockControls`, `GLTFLoader`, `RGBELoader`, `EffectComposer`,
`RenderPass`, `ShaderPass`, `OutputPass`, `AnimationMixer`.

```
src/
├── main.js           bootstrap, render loop, resize
├── scene.js          renderer, scene, fog, environment, base lights
├── assets.js         GLTF / texture / HDR loading + loading screen
├── house.js          rooms built from geometry, colliders, room zones
├── player.js         first-person controls, movement, collision, flashlight, breathing
├── interaction.js    Raycaster, hover highlight, interactable registry, inspect mode
├── game.js           state machine, objective chain, win/lose/restart, loop count
├── fear.js           fear meter, sources, tiers
├── hallucinations.js shadow figures, fake objects, off-screen shifts, random events
├── animation.js      door tweens, flicker, mixers, cinematic camera
├── effects.js        particles, sparks, dissolve, fear post-processing shader
├── audio.js          sound loading and playback
└── ui.js             HUD and screens (DOM)

public/
├── models/
├── textures/
├── environments/
└── audio/
```

**Game states:** `TITLE → INTRO → PLAYING ⇄ (INSPECTING | PAUSED) → WIN_SEQUENCE | LOSE_SEQUENCE → END_SCREEN`

**Collision:** the player is a circle (r = 0.3 m) on the XZ plane, tested against axis-aligned
boxes (walls, large furniture, closed doors) with sliding resolution. When a door opens, its
collider is removed.

---

## 11. Assets Plan

No modeling by us. All sources are free with licenses that allow use, and every asset is listed
in the README's **Asset Credits** section (name, author, source, license).

| Need | Source (first choice) | License |
|---|---|---|
| Floor / wall / ceiling / door textures (PBR sets) | Poly Haven | CC0 |
| Indoor HDRI | Poly Haven | CC0 |
| Furniture: bookshelf, desk, chairs, armchair, coat rack, side table, lamps | Quaternius / Kenney | CC0 |
| Door model | Kenney / Quaternius / Sketchfab | CC0 / CC-BY |
| Small props: key, flashlight, radio, music box, picture frames, books | Sketchfab, Poly Haven models | CC0 / CC-BY |
| Fuse box, battery | Built from primitives in code if nothing suitable is found | — |
| Shadow figure silhouette | Simple alpha texture made in code/canvas | — |
| Audio: creaks, hum, heartbeat, breathing, music box, whispers, footsteps | **Synthesized in code** (`src/audio.js`), no downloads | — |
| Font | Google Fonts | OFL |

Rule: we keep a running `CREDITS` list from the first download, not at the end.

---

## 12. Requirement Traceability

### 12.1 General UTS requirements
| Slide | Requirement | How HUSH meets it | Status |
|---|---|---|---|
| 05 | Mini game: gameplay, objective, challenge, progress, win/lose, restart | Inspection chain, fear management, checklist, escape / collapse, Play Again | ✅ |
| 08–09 | Original work | All code, scene, logic and UI written by us; no template/game base | ✅ |
| 10–11 | External assets credited | Assets plan + README Asset Credits | ✅ |
| 12 | JS, Three.js, HTML, CSS (+ Vite, npm, Git) | Stack in §10 | ✅ |
| 14 | 1 scene, camera, renderer, environment, ≥ 3 object types | 4-room house, many prop types | ✅ |
| 15 | Scene graph hierarchy | camera → flashlight; doorPivot → door → handles; houseRoot → rooms | ✅ |
| 16 | ≥ 1 GLTF/GLB | Furniture, door, props | ✅ |
| 17 | PBR material | `MeshStandardMaterial` with color/roughness/normal/metalness maps | ✅ |
| 18 | Ambient/Hemisphere + Directional/Point/Spot | Hemisphere + moonlight Spot + flashlight Spot + Point lamps | ✅ |
| 19 | castShadow + receiveShadow | Flashlight & moonlight shadows on props/floor; **shadows drive gameplay** | ✅ |
| 20 | Environment | Indoor scene + `FogExp2` + HDRI environment map | ✅ |
| 21 | ≥ 2 animations | Door swings, flicker, music box, dissolve, cinematic camera | ✅ |
| 22 | ≥ 3 interactions | 13 interactive objects; move, collect, inspect, activate, use item | ✅ |
| 23 | Raycaster | All hover / click / inspect use `THREE.Raycaster` | ✅ |
| 24 | Visual feedback | Hover highlight, sparks, dissolve, lamp glow, screen effects | ✅ |
| 25–26 | ≥ 2 VFX | Flicker, fear post-processing shader, dust Points, dissolve, sparks, shadow figures | ✅ |
| 27 | Camera supports gameplay | First-person with fear-driven sway/FOV + win cinematic | ✅ |
| 28 | HUD | Checklist, fear, battery, inventory, prompts | ✅ |
| 29–31 | Objective, win/lose, restart | Escape / fear 100 / Play Again | ✅ |
| 32 | Performance awareness | Budget in §9 | ✅ |
| 33 | Suggested project structure | §10 | ✅ |

### 12.2 Haunted House specification
| Requirement | How HUSH meets it | Status |
|---|---|---|
| ≥ 2 rooms | Foyer, Hallway, Library, Study | ✅ |
| ≥ 5 interactive objects | 13 (§7) | ✅ |
| ≥ 1 animated door | Library, Study, front door | ✅ |
| ≥ 1 flickering light | Hallway lamp (+ fear-driven flicker everywhere) | ✅ |
| Fog | `FogExp2`, fear-driven density | ✅ |
| Shadow | Flashlight + moonlight | ✅ |
| ≥ 1 GLB | Props | ✅ |
| ≥ 2 horror VFX | Light flicker, emissive eyes, shadow silhouettes, object shake, dissolving hallucinations | ✅ |
| Raycasting | All interactions | ✅ |
| Objective completion | Checklist → escape | ✅ |
| Interactions: click door, inspect, activate lamp, collect key, trigger event | All present (§7) | ✅ |
| Lighting: low ambient, point/spot, emissive | §8.1 | ✅ |
| Win: find main object / escape | Find the real key → escape | ✅ |

### 12.3 Optional challenges
| Challenge | HUSH | Status |
|---|---|---|
| Random event | Fear-weighted event pool | ✅ planned |
| Moving ghost | Replaced by shadow figures and off-screen shifts (deliberate design choice) | ↔ adapted |
| Audio trigger | Music box, radio, fuse box, events | ✅ planned |
| Cinematic camera | Win sequence | ✅ planned |
| Alternate ending | Escape loop vs "Not yet." collapse, plus loop memory | ✅ planned |

---

## 13. Scope Tiers

**MUST (the game isn't done without these)**
- 4 rooms, first-person movement + collision, PBR textures, lighting, fog, shadows, ≥ 1 GLB
- Raycast interaction + hover feedback, inspect mode, the full objective chain
- Flashlight + battery, fear meter + sources, breathing
- Flickering lamp, door animations, fear post-processing shader, dust particles
- Win / lose / restart, HUD, title screen
- README with Asset Credits

**SHOULD**
- Fake keys + dissolve (the shadow mechanic) — *very high priority, it's our signature*
- Shadow figures, random event pool, audio, win cinematic, tally-mark loop counter

**COULD (only if ahead of schedule)**
- Off-screen frustum shifts, following portrait eyes, breathing walls, loop memory variants

**If we fall behind, cut in this order:** COULD items → random event variety → shadow figures →
Study shrinks to a corner of the Library.

---

## 14. Schedule (14 days)

| Day | Date | Milestone |
|---|---|---|
| 1 | Oct 10 | Vite + Three.js setup, Git repo, renderer/scene/camera, one test room with PBR floor + fog |
| 2 | Oct 11 | First-person controls, collision, all 4 rooms blocked out from geometry |
| 3 | Oct 12 | Download assets, GLB loading, furniture placed, textures on all surfaces |
| 4 | Oct 13 | Lighting pass: hemisphere, moonlight, lamps, shadows, HDRI env, flickering lamp |
| 5 | Oct 14 | Raycaster interaction system, hover highlight, prompts, door pivot animation |
| 6 | Oct 15 | Inspect mode, items/inventory, full objective chain playable start → finish |
| 7 | Oct 16 | **Checkpoint: complete playable game without fear.** Fix bugs |
| 8 | Oct 17 | Flashlight + battery, fear meter, room light zones, breathing |
| 9 | Oct 18 | Fear post-processing shader, fog/FOV/sway tied to fear, dust particles |
| 10 | Oct 19 | Fake keys + dissolve, shadow figures, Study key event |
| 11 | Oct 20 | Win/lose sequences, restart, tally marks, title/intro/pause screens, HUD polish |
| 12 | Oct 21 | Audio, random events, sparks; **checkpoint: feature complete** |
| 13 | Oct 22 | Fear balancing, performance pass, playtesting, COULD items if time allows |
| 14 | Oct 23 | README (+ credits), final bug fixes, demo rehearsal. Buffer for Oct 24. |

**Rule:** one milestone at a time, and every graphics concept gets explained as it's built, so we
can both defend any part of the project in the demo.

---

## 15. Open Questions / To Tune Later
- Exact fear rates and battery drain (playtest on Day 13).
- Fake objects currently appear only at the key step (spawning them anywhere at fear ≥ 75 is a COULD item).

---

## 16. Implementation Notes (as built)

Status on 2026-10-10: **all MUST and SHOULD items are implemented**, plus the COULD items for
off-screen frustum shifts, loop memory variants and the portrait eyes. A scripted headless
playthrough test passes the full loop: objectives, shadow puzzle, win loop and lose loop.

Changes from the original plan, and why:

| Plan | As built | Reason |
|---|---|---|
| Moonlight as `DirectionalLight` | `SpotLight` outside the window | A directional light lights every room; a spot's cone plus wall shadows limits it to the window patch |
| Room lamps behind switches | Foyer + hallway: wall switches that need power. Library + study: **oil lamps** (no power needed) | Gives an early safe zone; the study lamp "dying" fits an oil flame |
| Study lamp | Already burning behind the stuck study door | When the door creaks open by itself, warm light spills out, then the flame dies as you enter |
| Real/fake keys "around the study" | Four keys **hanging on wall hooks** 16 cm from the wall | A key lying flat casts almost no visible shadow; hanging keys throw a clear shadow on the wallpaper |
| Audio from freesound / Pixabay | All audio synthesized in code | No licensing, more original work, positional via `PositionalAudio` |
| Shadow figures at 50–70° | Spawn just inside the horizontal FOV edge (computed from `fov` and `aspect`) | At 16:9 the screen edge is ~51°; anything beyond is never visible |
| Tally marks = loop count | 23 old marks + one per completed loop | With 0 marks on the first run the cue would be invisible; 23 implies many earlier loops |
| Fuse box door | Animated through an `AnimationMixer` with an `AnimationClip` authored in code | The GLB ships without animations, but has a separate door node |

Loop memory as built: tally marks; the inspector's clipboard already on the foyer console (loop ≥ 1);
checklist item 1 pre-ticked in red (loop ≥ 1); more scratches on the family photo; the desk note
reads *"STOP OPENING THE DOOR"* (loop ≥ 2).
- Final HUD font and visual style.
