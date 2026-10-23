import * as THREE from 'three';
import { TUNING, EYE_HEIGHT, PLAYER_START, ROOMS, roomAt } from './config.js';
import { tweens, ease } from './animation.js';
import { Fear } from './fear.js';
import { ShadowFigures, Shifters, EventDirector, dissolve } from './hallucinations.js';
import { makeDissolvable } from './effects.js';
import { FOG_BASE_DENSITY } from './scene.js';
import { noteTexture, familyPhotoTexture } from './textures.js';

// Game state machine, objective chain, interactions, fear-driven effects and endings.
//
// States: title → intro → playing ⇄ (inspecting | paused) → ending → end

const CHECKLIST = [
  { id: 'entrance', text: 'Check main entrance' },
  { id: 'light', text: 'Locate a light source' },
  { id: 'fuse', text: 'Find a replacement fuse' },
  { id: 'power', text: 'Restore power' },
  { id: 'key', text: 'Find the spare key' },
  { id: 'leave', text: 'Leave' },
];

const BASE_TALLY = 23;

function loadLoops() {
  try {
    return parseInt(localStorage.getItem('hush.loops') || '0', 10) || 0;
  } catch {
    return 0;
  }
}
function saveLoops(n) {
  try {
    localStorage.setItem('hush.loops', String(n));
  } catch {
    /* storage unavailable: the loop just isn't remembered */
  }
}

export class Game {
  constructor(ctx) {
    Object.assign(this, ctx); // scene, camera, world, house, player, interaction, inspector, ui, sound, post, dust, sparks
    this.state = 'title';
    this.fear = new Fear();
    this.loops = loadLoops();
    this.time = 0;
    this.pulse = 0;
    this.smoothedFear = this.fear.value / 100;
    this.lastRoom = 'foyer';
    this.hintsShown = new Set();

    this.figures = new ShadowFigures(this.scene, this.house.occluders);
    this.shifters = new Shifters(this.camera);
    this.setupShifters();
    this.events = new EventDirector(this.buildEvents(), { min: TUNING.events.minGap, max: TUNING.events.maxGap });

    this.sound.onBeat = () => (this.pulse = 1);
    this.setupAudioSources();
    this.setupInteractions();
    this.setupInput();
    this.setupUI();
    this.resetWorld();
  }

  // ================================================================ setup

  setupAudioSources() {
    const w = this.world;
    this.audio = {
      radio: this.sound.attachLoop('radio', w.radio.object, { volume: 0.7, ref: 1.2 }),
      musicBox: this.sound.attachLoop('musicbox', w.musicBox.object, { volume: 1.0, ref: 1.0 }),
      hum: this.sound.attachLoop('hum', w.fuseBox.object, { volume: 0.25, ref: 0.8 }),
      tick: this.sound.attachLoop('tick', w.clock.object, { volume: 0.5, ref: 0.8 }),
    };
  }

  setupShifters() {
    const w = this.world;
    const chair = w.libraryChair;
    const chairRot = chair.rotation.y;
    this.shifters.add(chair, () => (chair.rotation.y = chairRot + 2.6), () => (chair.rotation.y = chairRot));
    const frame = w.hallFrame;
    this.shifters.add(frame, () => (frame.rotation.z = 0.22), () => (frame.rotation.z = 0));
  }

  buildEvents() {
    const w = this.world;
    const far = () => {
      const p = this.player.position.clone();
      const a = Math.random() * Math.PI * 2;
      return p.add(new THREE.Vector3(Math.cos(a) * 6, 1.5, Math.sin(a) * 6));
    };
    return [
      {
        name: 'flicker', minTier: 0, weight: 3,
        when: () => this.flags.power,
        run: () => {
          for (const l of Object.values(w.lamps)) if (l.on) l.burst = 1.6;
          this.fear.add(3);
        },
      },
      { name: 'chime', minTier: 0, weight: 1, run: () => { this.sound.play('chime', { at: w.clock.object.position.clone().setY(1.8), volume: 0.8, ref: 2 }); this.fear.add(3); } },
      { name: 'creak', minTier: 1, weight: 2, run: () => { this.sound.play('creak', { at: far(), volume: 0.6, rate: 0.8 }); this.fear.add(4); } },
      { name: 'footsteps', minTier: 1, weight: 2, run: () => { this.sound.play('footstepsAbove', { volume: 0.35 }); this.fear.add(5); } },
      {
        name: 'musicbox', minTier: 1, weight: 1,
        when: () => !this.flags.keyEvent,
        run: () => { this.sound.play('musicbox', { at: w.musicBox.object.getWorldPosition(new THREE.Vector3()), volume: 0.35, ref: 2 }); this.fear.add(4); },
      },
      {
        name: 'whisper', minTier: 2, weight: 2,
        run: () => {
          const behind = this.player.forward(new THREE.Vector3()).setY(0).normalize().multiplyScalar(-1.2);
          this.sound.play('whisper', { at: this.player.position.clone().add(behind), volume: 0.8 });
          this.fear.add(6);
        },
      },
      {
        name: 'door', minTier: 2, weight: 1,
        when: () => w.doors.library.isOpen && this.room !== 'library',
        run: () => {
          w.doors.library.close(2.4);
          this.sound.play('creak', { at: w.doors.library.center, volume: 0.7, rate: 0.9 });
          this.fear.add(6);
        },
      },
    ];
  }

  setupInput() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyE') this.onUse();
      if (e.code === 'KeyF' && this.state === 'playing') {
        if (this.player.toggleFlashlight()) this.sound.play('click', { volume: 0.5 });
        else if (this.player.hasFlashlight) this.ui.message('The battery is dead.');
      }
      if (this.debug && e.code === 'KeyP') console.log(this.player.position, this.player.yaw);
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.player.controls.isLocked) this.onUse();
    });
    this.player.controls.addEventListener('unlock', () => {
      if (this.state === 'playing' || this.state === 'inspecting') this.pause();
    });
  }

  setupUI() {
    const ui = this.ui;
    ui.on('start', async () => {
      await this.sound.init();
      this.state = 'intro';
      ui.show('intro');
    });
    document.querySelector('#intro').addEventListener('click', () => {
      if (this.state === 'intro') this.beginPlay(true);
    });
    ui.on('resume', () => this.resume());
    ui.on('restart', () => {
      this.resetWorld();
      this.beginPlay(false);
    });
    ui.on('title', () => {
      this.resetWorld();
      this.state = 'title';
      ui.hud(false);
      ui.setLoops(this.loops);
      ui.show('title');
    });
    ui.on('again', () => this.beginPlay(false));
    ui.setLoops(this.loops);
  }

  // ================================================================ interactions

  setupInteractions() {
    const w = this.world, ui = this.ui, I = this.interaction;
    const f = () => this.flags;

    // --- Front door
    I.add({
      object: w.doors.front.object,
      prompt: () => (f().key ? '[E] Unlock the door' : '[E] Open'),
      action: () => {
        if (f().key) return this.win();
        w.doors.front.rattle();
        this.sound.play('rattle', { at: w.doors.front.center, volume: 0.9 });
        if (!this.done('entrance')) {
          ui.message("Locked. You don't remember it closing.");
          this.fear.add(TUNING.fear.lockedDoor);
          this.complete('entrance');
        } else {
          ui.message(['Still locked.', "It won't move.", 'Locked from the outside?'][Math.floor(Math.random() * 3)]);
        }
      },
    });

    // --- Coat → flashlight
    I.add({
      object: w.coat,
      prompt: () => (f().flashlight ? null : '[E] Search the coat'),
      action: () => {
        this.player.hasFlashlight = true;
        this.player.flashOn = true;
        f().flashlight = true;
        this.sound.play('pickup', { volume: 0.8 });
        this.complete('light');
        ui.message('A flashlight in the pocket. The same one you carry.');
        this.hintOnce('flash', '<b>F</b> toggle flashlight', 6);
      },
    });

    // --- Interior doors
    I.add({
      object: w.doors.library.object,
      prompt: () => (w.doors.library.isOpen ? null : '[E] Open'),
      action: () => {
        w.doors.library.open();
        this.sound.play('creak', { at: w.doors.library.center, volume: 0.8 });
      },
    });
    I.add({
      object: w.doors.study.object,
      prompt: () => (w.doors.study.isOpen ? null : '[E] Open'),
      action: () => {
        if (!f().power) {
          w.doors.study.rattle();
          this.sound.play('rattle', { at: w.doors.study.center, volume: 0.6 });
          ui.message("It won't budge.");
          return;
        }
        w.doors.study.open();
        this.sound.play('creak', { at: w.doors.study.center, volume: 0.8 });
      },
    });

    // --- Notes
    I.add({
      object: w.deskNote,
      prompt: () => '[E] Read the note',
      action: () => {
        const lines = this.loops >= 2
          ? 'Third shelf.<br>Behind the red books.<br><br>STOP OPENING<br>THE DOOR.'
          : 'Third shelf.<br>Behind the red books.<br><br>You always forget.';
        this.inspect(w.deskNote, 'A note', lines, true, {
          baseRotation: new THREE.Euler(Math.PI / 2, 0, 0),
          after: () => this.onceMessage('handwriting', "That's your handwriting."),
        });
      },
    });
    I.add({
      object: w.studyNote,
      prompt: () => '[E] Read the note',
      action: () =>
        this.inspect(w.studyNote, 'A note', "If it has no shadow,<br>it isn't there.", true, {
          baseRotation: new THREE.Euler(Math.PI / 2, 0, 0),
        }),
    });

    // --- Bookshelf → fuse
    I.add({
      object: w.redBooks.object,
      prompt: () => (f().booksMoved ? null : '[E] Move the red books'),
      action: () => {
        f().booksMoved = true;
        const b = w.redBooks.object, rest = w.redBooks.rest;
        this.sound.play('paper', { at: rest, volume: 0.8, rate: 0.6 });
        tweens.add({
          duration: 0.8,
          easing: ease.out,
          update: (k) => {
            b.position.set(rest.x - 0.25 * k, rest.y, rest.z + 0.22 * k);
            b.rotation.y = 0.5 * k;
          },
        });
      },
    });
    I.add({
      object: w.fuse,
      prompt: () => (f().booksMoved && !f().fuse ? '[E] Take the fuse' : null),
      action: () => {
        f().fuse = true;
        w.fuse.visible = false;
        this.sound.play('pickup', { volume: 0.8 });
        this.complete('fuse');
        ui.message('A ceramic fuse. Old, but it looks new.');
      },
    });

    // --- Fuse box (GLB door animated by an AnimationMixer clip)
    I.add({
      object: w.fuseBox.object,
      prompt: () => {
        if (!w.fuseBox.opened) return '[E] Open the fuse box';
        if (f().power) return null;
        return f().fuse ? '[E] Insert the fuse' : '[E] Look inside';
      },
      action: () => {
        const fb = w.fuseBox;
        if (!fb.opened) {
          fb.opened = true;
          fb.openAction.reset().play();
          this.sound.play('creak', { at: fb.object.position, volume: 0.4, rate: 1.8 });
          if (!f().fuse) ui.message('One fuse is missing.');
          return;
        }
        if (!f().fuse) return ui.message('One fuse is missing. Where would you keep a spare?');
        this.restorePower();
      },
    });

    // --- Light switches (need power)
    const flip = (id) => {
      const sw = w.switches[id];
      this.switchState[id] = !this.switchState[id];
      sw.toggle.rotation.x = this.switchState[id] ? -0.5 : 0.5;
      this.sound.play('click', { at: sw.group.position, volume: 0.6 });
      if (!f().power) ui.message('Click. Nothing.');
      this.updateLamps();
    };
    I.add({ object: w.switches.foyer.group, prompt: () => '[E] Flip the switch', action: () => flip('foyer') });
    I.add({ object: w.switches.hallway.group, prompt: () => '[E] Flip the switch', action: () => flip('hallway') });

    // --- Oil lamps (no power needed)
    I.add({
      object: w.libraryLampObj,
      prompt: () => (w.lamps.library.on ? '[E] Put out the lamp' : '[E] Light the lamp'),
      action: () => {
        w.lamps.library.set(!w.lamps.library.on);
        this.sound.play('click', { volume: 0.3, rate: 0.5 });
      },
    });
    I.add({
      object: w.studyLampObj,
      prompt: () => (w.lamps.study.on ? '[E] Put out the lamp' : '[E] Light the lamp'),
      action: () => {
        if (f().keyEvent && !f().key) return ui.message("It won't light.");
        w.lamps.study.set(!w.lamps.study.on);
        this.sound.play('click', { volume: 0.3, rate: 0.5 });
      },
    });

    // --- Radio (needs power, calming)
    I.add({
      object: w.radio.object,
      prompt: () => (w.radio.on ? '[E] Turn off the radio' : '[E] Turn on the radio'),
      action: () => {
        if (!f().power) return ui.message('Dead. It needs power.');
        this.setRadio(!w.radio.on);
      },
    });

    // --- Family photo (calming, once per loop)
    I.add({
      object: w.familyPhoto.object,
      prompt: () => '[E] Look at the photo',
      action: () => {
        this.inspect(
          w.familyPhoto.object,
          'A photograph',
          'A family in front of this house. They look happy.<br><br>One face has been scratched out.'
        );
        if (!f().photoCalm) {
          f().photoCalm = true;
          this.fear.add(TUNING.fear.familyPhoto);
        }
      },
    });

    // --- Portrait
    I.add({
      object: w.portrait.object,
      prompt: () => '[E] Look closer',
      action: () =>
        this.inspect(w.portrait.object, 'A portrait', 'The paint is cracked and dark.<br><br>The eyes are painted on. Aren\'t they?'),
    });

    // --- Tally marks
    I.add({
      object: w.tally.mesh,
      prompt: () => '[E] Look closer',
      action: () => ui.message(`Scratches in the plaster. You count them. ${BASE_TALLY + this.loops}.`, 4.5),
    });

    // --- Clock
    I.add({
      object: w.clock.object,
      prompt: () => '[E] Check the time',
      action: () => ui.message('3:17. It was 3:17 when you came in.'),
    });

    // --- Music box
    I.add({
      object: w.musicBox.object,
      prompt: () => (w.musicBox.playing ? '[E] Close the music box' : '[E] Open the music box'),
      action: () => {
        if (w.musicBox.playing) {
          this.setMusicBox(false);
          this.fear.add(-3);
        } else {
          this.setMusicBox(true);
          if (!f().keyEvent && f().power) this.keyEvent();
        }
      },
    });

    // --- Batteries
    for (const b of w.batteries) {
      I.add({
        object: b,
        prompt: () => (b.visible ? '[E] Take the battery' : null),
        action: () => {
          b.visible = false;
          this.player.battery = Math.min(100, this.player.battery + TUNING.battery.pickup);
          this.sound.play('pickup', { volume: 0.8 });
          ui.message('A battery.');
        },
      });
    }
  }

  // ================================================================ objective helpers

  done(id) {
    return this.completed.has(id);
  }

  complete(id, ghost = false) {
    if (this.completed.has(id)) return;
    this.completed.add(id);
    if (ghost) this.ghostTicks.add(id);
    this.refreshChecklist();
  }

  refreshChecklist() {
    this.ui.setChecklist(
      CHECKLIST.map((c) => ({ text: c.text, done: this.completed.has(c.id), ghost: this.ghostTicks.has(c.id) }))
    );
    const inv = [];
    if (this.flags.flashlight) inv.push('Flashlight');
    if (this.flags.fuse && !this.flags.power) inv.push('Fuse');
    if (this.flags.key) inv.push('Key');
    this.ui.setInventory(inv);
  }

  hintOnce(id, html, seconds) {
    if (this.hintsShown.has(id)) return;
    this.hintsShown.add(id);
    this.ui.hint(html, seconds);
  }

  onceMessage(id, text) {
    if (this.hintsShown.has(id)) return;
    this.hintsShown.add(id);
    this.ui.message(text);
  }

  // ================================================================ world state

  resetWorld() {
    const w = this.world;
    this.flags = { flashlight: false, fuse: false, booksMoved: false, power: false, keyEvent: false, key: false, photoCalm: false };
    this.completed = new Set();
    this.ghostTicks = new Set();
    this.switchState = { foyer: true, hallway: true };
    w.switches.foyer.toggle.rotation.x = -0.5;
    w.switches.hallway.toggle.rotation.x = -0.5;

    this.fear.reset();
    this.player.reset();
    this.player.setPose(PLAYER_START.x, PLAYER_START.z, PLAYER_START.yaw);
    for (const d of Object.values(w.doors)) d.reset();

    for (const l of Object.values(w.lamps)) {
      l.set(false);
      l.level = 0;
      l.burst = 0;
    }
    w.lamps.study.set(true); // an oil lamp burning behind a locked door

    this.setRadio(false);
    this.setMusicBox(false, true);
    this.audio?.hum.stop();
    w.redBooks.object.position.copy(w.redBooks.rest);
    w.redBooks.object.rotation.set(0, 0, 0);
    w.fuse.visible = true;
    const fb = w.fuseBox;
    fb.opened = false;
    fb.mixer.stopAllAction();
    fb.object.getObjectByName('power_box_01_door').quaternion.identity();
    fb.fuseInside.visible = false;
    fb.ledMat.emissive.setHex(0xff2010);
    for (const b of w.batteries) b.visible = true;
    this.clearKeys();

    this.figures.clear();
    this.shifters.reset();
    this.events.reset();
    this.inspector.close();
    this.ui.closeInspect();

    // Loop memory
    for (const m of w.loopMemory) m.object.visible = this.loops >= m.minLoop;
    if (this.appliedLoops !== this.loops) {
      // regenerate loop-dependent textures only when the loop count actually changed
      this.appliedLoops = this.loops;
      w.tally.setCount(BASE_TALLY + this.loops);
      w.familyPhoto.material.map?.dispose();
      w.familyPhoto.material.map = familyPhotoTexture(1 + Math.min(this.loops, 3));
      w.familyPhoto.material.needsUpdate = true;
    }
    if (this.loops >= 2 && !this.stopNoteApplied) {
      this.stopNoteApplied = true;
      const note = w.deskNote.children[0];
      note.material.map = noteTexture(['Third shelf.', 'Behind the red books.', '', 'STOP OPENING', 'THE DOOR.'], 3);
      note.material.needsUpdate = true;
    }
    if (this.loops >= 1) this.complete('entrance', true);

    this.updateLamps();
    this.refreshChecklist();
    this.post.fear.uFade.value = 0;
    this.post.fear.uWhite.value = 0;
    this.house.exitLight.material.color.setHex(0x000000);
    this.room = 'foyer';
    this.playTime = 0;
  }

  updateLamps() {
    const w = this.world, p = this.flags.power;
    w.lamps.foyer.set(p && this.switchState.foyer);
    w.lamps.hallA.set(p && this.switchState.hallway);
    w.lamps.hallB.set(p && this.switchState.hallway);
  }

  setRadio(on) {
    const r = this.world.radio;
    r.on = on;
    for (const m of r.dialMats) m.emissiveIntensity = on ? 2 : 0;
    if (on) this.audio?.radio.start();
    else this.audio?.radio.stop();
  }

  setMusicBox(on, instant = false) {
    const mb = this.world.musicBox;
    mb.playing = on;
    const lidFrom = mb.lidPivot.rotation.x, lidTo = on ? -1.9 : 0;
    const dFrom = mb.dancer.position.y, dTo = on ? mb.upY : mb.restY;
    if (on) mb.dancer.visible = true;
    const apply = (k) => {
      mb.lidPivot.rotation.x = lidFrom + (lidTo - lidFrom) * k;
      mb.dancer.position.y = dFrom + (dTo - dFrom) * k;
      if (!on && k >= 1) mb.dancer.visible = false;
    };
    if (instant) apply(1);
    else tweens.add({ duration: on ? 2.2 : 0.6, easing: ease.inOut, update: apply });
    if (on) this.audio?.musicBox.start();
    else this.audio?.musicBox.stop();
  }

  async restorePower() {
    const w = this.world, fb = w.fuseBox;
    fb.fuseInside.visible = true;
    this.flags.power = true;
    this.refreshChecklist();
    const sparkAt = fb.fuseInside.getWorldPosition(new THREE.Vector3());
    this.sparks.burst(sparkAt, new THREE.Vector3(-1, 0.2, 0), 70);
    this.sound.play('spark', { at: sparkAt, volume: 1 });
    this.player.shake = 0.6;
    await tweens.wait(0.7);
    this.updateLamps();
    for (const l of Object.values(w.lamps)) if (l.on) l.burst = 1.2;
    fb.ledMat.emissive.setHex(0x30ff60);
    this.audio.hum.start();
    this.complete('power');
    this.ui.message('The house hums back to life.');
    // a few seconds later, the study door opens on its own
    await tweens.wait(5);
    if (this.state === 'ending' || !this.flags.power) return;
    if (!w.doors.study.isOpen) {
      w.doors.study.open(4.5);
      this.sound.play('creak', { at: w.doors.study.center, volume: 0.9, rate: 0.7 });
      this.fear.add(5);
    }
  }

  // The key event: the lamp dies, the music box plays by itself,
  // and four keys hang in the study. Only one of them casts a shadow.
  async keyEvent() {
    const w = this.world;
    this.flags.keyEvent = true;
    this.fear.add(TUNING.fear.musicBox);
    w.lamps.study.burst = 1.0;
    await tweens.wait(0.9);
    w.lamps.study.set(false);
    if (!w.musicBox.playing) this.setMusicBox(true);
    this.ui.message('The lamp dies. The music box plays on its own.', 4);

    const realIndex = this.debugRealKey ?? Math.floor(Math.random() * w.keySpots.length);
    this.keys = w.keySpots.map((spot, i) => {
      const key = w.makeKey();
      const real = i === realIndex;
      key.position.copy(spot.position);
      key.rotation.y = spot.rotY + (Math.random() - 0.5) * 0.3;
      key.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = real; // the whole puzzle: hallucinations have no shadow
        o.receiveShadow = true;
        o.userData.keepMaterial = true;
      });
      if (!real) makeDissolvable(key.children[0].material);
      // all parts share one material per key, so the dissolve covers every part
      const mat = key.children[0].material;
      key.traverse((o) => o.isMesh && (o.material = mat));
      this.scene.add(key);
      const entry = this.interaction.add({
        object: key,
        prompt: () => '[E] Take the key',
        action: () => (real ? this.takeRealKey() : this.takeFakeKey(key, entry)),
      });
      return { key, entry, real };
    });
    await tweens.wait(6);
    if (!this.flags.key && this.state !== 'ending') this.ui.message('Four keys. There was only one spare.', 4);
  }

  takeRealKey() {
    this.flags.key = true;
    this.sound.play('pickup', { volume: 0.9 });
    this.complete('key');
    this.ui.message('Cold metal. Heavy. Real.');
    this.setMusicBox(false);
    for (const k of this.keys) {
      this.interaction.remove(k.entry);
      if (k.real) this.scene.remove(k.key);
      else dissolve(k.key.children[0].material, 1.5).then(() => this.scene.remove(k.key));
    }
    this.keys = [];
  }

  takeFakeKey(key, entry) {
    this.interaction.remove(entry);
    this.keys = this.keys.filter((k) => k.key !== key);
    this.fear.add(TUNING.fear.fakeItem);
    this.player.shake = 0.5;
    this.sound.play('whisper', { at: key.position, volume: 0.9, rate: 1.2 });
    this.ui.message(['It crumbles in your hand.', 'There was nothing there.', 'Your fingers close on air.'][Math.floor(Math.random() * 3)]);
    dissolve(key.children[0].material, 1.2).then(() => this.scene.remove(key));
  }

  clearKeys() {
    for (const k of this.keys ?? []) {
      this.interaction.remove(k.entry);
      this.scene.remove(k.key);
    }
    this.keys = [];
  }

  // ================================================================ flow

  beginPlay(fromIntro) {
    this.state = 'playing';
    this.ui.show(null);
    this.ui.clearStory();
    this.ui.hud(true);
    this.player.canMove = true;
    this.player.handHidden = false;
    this.interaction.enabled = true;
    this.player.controls.enabled = true;
    this.audio.tick.start();
    try {
      this.player.lock();
    } catch {
      /* pointer lock unavailable (e.g. automated test) */
    }
    if (fromIntro) this.hintOnce('move', '<b>WASD</b> move · <b>Mouse</b> look · <b>E</b> interact', 7);
  }

  pause() {
    if (this.state === 'inspecting') this.closeInspect();
    this.state = 'paused';
    this.ui.show('pause');
  }

  resume() {
    this.state = 'playing';
    this.ui.show(null);
    this.player.lock();
  }

  onUse() {
    if (this.state === 'inspecting') return this.closeInspect();
    if (this.state !== 'playing') return;
    this.interaction.activate();
  }

  inspect(object, title, text, handwritten = false, { baseRotation = null, after = null } = {}) {
    this.state = 'inspecting';
    this.inspectAfter = after;
    this.player.canMove = false;
    this.player.controls.enabled = false;
    this.interaction.enabled = false;
    this.inspector.open(object, { baseRotation });
    this.ui.inspect(title, text, handwritten);
    this.ui.setPrompt(null);
    this.sound.play('paper', { volume: 0.6 });
  }

  closeInspect() {
    this.inspector.close();
    this.ui.closeInspect();
    this.player.canMove = true;
    this.player.controls.enabled = true;
    this.interaction.enabled = true;
    this.state = 'playing';
    this.inspectAfter?.();
    this.inspectAfter = null;
  }

  lockOut() {
    this.state = 'ending';
    this.player.canMove = false;
    this.player.controls.enabled = false;
    this.interaction.enabled = false;
    this.player.handHidden = true;
    this.ui.setPrompt(null);
    this.figures.clear();
  }

  async win() {
    const w = this.world, P = this.post.fear, head = this.player.head;
    this.complete('leave');
    this.lockOut();
    this.sound.play('unlock', { at: w.doors.front.center, volume: 1 });
    await tweens.wait(0.8);
    this.ui.hud(false);

    // cinematic: settle in front of the door, then walk into the light
    const p0 = head.position.clone(), q0 = head.quaternion.clone();
    const p1 = new THREE.Vector3(0, EYE_HEIGHT, 6.5);
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0, 'YXZ'));
    await tweens.add({
      duration: 1.4,
      update: (k) => {
        head.position.lerpVectors(p0, p1, k);
        head.quaternion.slerpQuaternions(q0, q1, k);
      },
    });
    w.doors.front.open(2.6);
    this.sound.play('creak', { at: w.doors.front.center, volume: 1, rate: 0.75 });
    const exit = this.house.exitLight.material.color;
    tweens.add({ duration: 2.0, update: (k) => exit.setScalar(k * 3) });
    await tweens.wait(1.2);
    await tweens.add({
      duration: 3.2,
      easing: ease.in,
      update: (k) => {
        head.position.z = 6.5 + k * 1.6;
        P.uWhite.value = k;
      },
    });
    this.ui.story('<h2>YOU ESCAPED</h2>', 'light');
    await tweens.wait(3.2);
    this.ui.clearStory();
    await tweens.add({ duration: 1.6, update: (k) => { P.uFade.value = k; P.uWhite.value = 1 - k; } });

    this.loops += 1;
    saveLoops(this.loops);
    this.resetWorld();
    P.uFade.value = 1;
    this.lockOut();
    await tweens.wait(1.5);
    await tweens.add({ duration: 2.5, update: (k) => (P.uFade.value = 1 - k) });
    this.ui.story("<p>You escaped.</p><p>Didn't you?</p>");
    await tweens.wait(4.5);
    this.ui.clearStory();
    await tweens.wait(1);
    this.showEnd();
  }

  async lose() {
    const P = this.post.fear;
    this.lockOut();
    this.ui.hud(false);
    this.sound.play('impact', { volume: 1 });
    this.player.shake = 1.5;
    await tweens.add({ duration: 2.6, easing: ease.in, update: (k) => (P.uFade.value = k) });
    this.ui.story('<h2>YOU LOST YOURSELF</h2>');
    await tweens.wait(3.2);
    this.ui.clearStory();
    await tweens.wait(1.2);
    this.resetWorld();
    P.uFade.value = 1;
    this.lockOut();
    await tweens.wait(1);
    await tweens.add({ duration: 2.5, update: (k) => (P.uFade.value = 1 - k) });
    this.ui.story('<p>Not yet.</p>');
    await tweens.wait(3.5);
    this.ui.clearStory();
    await tweens.wait(1);
    this.showEnd();
  }

  showEnd() {
    this.state = 'end';
    this.player.controls.unlock();
    this.ui.setLoops(this.loops);
    this.ui.endScreen(`<h2>HUSH</h2><p>${this.loops > 0 ? `tally marks: ${BASE_TALLY + this.loops}` : ''}</p>`);
  }

  // ================================================================ per frame

  lightLevel(room) {
    const l = this.world.lamps;
    switch (room) {
      case 'foyer': return l.foyer.on ? 'lit' : 'dim';
      case 'hallway': return l.hallA.on ? 'lit' : 'dark';
      case 'library': return l.library.on ? 'lit' : 'dark';
      case 'study': return l.study.on ? 'lit' : 'dark';
      default: return 'dark';
    }
  }

  update(dt) {
    this.time += dt;
    const t = this.time, w = this.world, playing = this.state === 'playing';
    tweens.update(dt);
    for (const m of w.mixers) m.update(dt);
    // the moon's shadow map is static; only the escape (front door swinging) needs it redrawn
    if (this.state === 'ending') this.baseLights.moon.shadow.needsUpdate = true;

    const pos = this.player.position;
    this.room = roomAt(pos.x, pos.z) ?? this.room;

    if (playing || this.state === 'inspecting') {
      this.player.update(dt, t);
      if (playing) this.updateFootsteps();
    } else {
      this.player.update(dt, t); // camera life continues in menus/endings
    }

    // --- fear
    const staring = this.isStaringAtPortrait();
    if (playing) {
      this.fear.update(dt, {
        light: this.lightLevel(this.room),
        flashlight: this.player.flashOn,
        breathTime: this.player.breathTime,
        radio: w.radio.on && this.room === 'library',
        staring,
      });
      if (this.fear.value >= 100) this.lose();
      if (this.fear.value > 40) this.hintOnce('breathe', 'Fear grows in the dark.<br>Hold <b>Space</b> to breathe.', 7);
      if (this.player.hasFlashlight && this.player.battery < 25) this.hintOnce('battery', 'Your battery is running low.', 5);
      this.events.update(dt, this.fear.tier, {});
      this.playTime = (this.playTime ?? 0) + dt;
      if (this.playTime > 12 && !this.flags.flashlight) {
        this.onceMessage('dark', "Too dark to work like this. Didn't you bring a light?");
      }
      this.figures.update(dt, this.player, this.fear.value);
      this.shifters.update(this.fear.value);
      if (this.room === 'study' && this.flags.power && !this.flags.keyEvent && w.doors.study.isOpen) {
        const r = ROOMS.study;
        if (pos.z < r.maxZ - 0.9) this.keyEvent();
      }
    }

    // --- fear → visuals
    const f = this.fear.value / 100;
    this.smoothedFear += (f - this.smoothedFear) * Math.min(1, dt * 2);
    const sf = this.smoothedFear;
    const P = this.post.fear;
    P.uFear.value = sf;
    P.uTime.value = t;
    this.pulse = Math.max(0, this.pulse - dt * 3);
    P.uPulse.value = this.pulse;
    P.uBreath.value += ((this.player.breathing ? 1 : 0) - P.uBreath.value) * Math.min(1, dt * 2);
    P.uDim.value += ((this.state === 'inspecting' ? 1 : 0) - P.uDim.value) * Math.min(1, dt * 6);
    this.scene.fog.density = FOG_BASE_DENSITY + sf * 0.09;
    this.player.sway = THREE.MathUtils.smoothstep(sf, 0.5, 1.0);
    const panic = THREE.MathUtils.smoothstep(sf, 0.75, 1.0);
    this.camera.fov = 70 + Math.sin(t * 0.8) * 4 * panic;
    this.camera.updateProjectionMatrix();

    // lamps (fear makes every lamp less stable)
    const fearFlicker = Math.max(0, (sf - 0.25) / 0.75) * 0.3;
    for (const l of Object.values(w.lamps)) l.update(dt, t, fearFlicker);

    // portrait eyes
    const eyes = Math.max(0, (sf - 0.25) / 0.5) * 0.6 + (staring ? 0.5 : 0);
    w.portrait.material.emissiveIntensity += (eyes - w.portrait.material.emissiveIntensity) * Math.min(1, dt * 2);

    // clock hands spin backwards in panic
    if (panic > 0.01 && w.clock.minute) {
      w.clock.minute.rotateZ(-dt * 3 * panic);
      w.clock.hour?.rotateZ(-dt * 0.25 * panic);
    }

    // rocking chair: rocks by itself, harder when afraid
    w.rocker.rotation.x = Math.sin(t * 1.4) * (0.03 + sf * 0.06);

    // music box dancer spins while playing
    if (w.musicBox.playing) w.musicBox.dancer.rotation.y += dt * 1.6;

    this.sparks.update(dt);
    this.dust.update(t, pos, this.player.flashlight, this.lightLevel(this.room) === 'lit' ? 0.05 : 0);
    this.inspector.update(dt);
    this.sound.update(dt, { fear: this.fear.value, breathing: this.player.breathing, playing });
    this.interactionPrompt(playing);
    this.updateHUD();
  }

  isStaringAtPortrait() {
    const p = this.world.portrait.object.getWorldPosition(new THREE.Vector3());
    const to = p.sub(this.player.position);
    const d = to.length();
    if (d > 6) return false;
    return this.player.forward(new THREE.Vector3()).dot(to.normalize()) > Math.cos(0.2);
  }

  updateFootsteps() {
    const phase = this.player.bobPhase;
    const stepIndex = Math.floor(phase / Math.PI);
    if (stepIndex !== this.lastStep) {
      this.lastStep = stepIndex;
      if (this.player.moving > 0.5) this.sound.play('step', { volume: 0.22, rate: 0.85 + Math.random() * 0.3 });
    }
  }

  interactionPrompt(playing) {
    if (!playing) {
      this.interaction.setHover(null);
      this.ui.setPrompt(null);
      return;
    }
    const hit = this.interaction.update();
    this.ui.setPrompt(hit?.prompt ?? null);
  }

  updateHUD() {
    this.ui.setFear(this.fear.value, this.pulse);
    this.ui.setBattery(this.player.battery, this.player.hasFlashlight);
  }
}
