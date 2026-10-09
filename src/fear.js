import { TUNING, tierOf } from './config.js';

// The Fear meter (0–100). At 100 the player collapses.

export class Fear {
  constructor() {
    this.reset();
  }

  reset() {
    this.value = TUNING.fear.start;
    this.rate = 0;
  }

  add(amount) {
    this.value = Math.max(0, Math.min(100, this.value + amount));
  }

  get tier() {
    return tierOf(this.value);
  }

  /**
   * @param {number} dt
   * @param {object} c
   * @param {'dark'|'dim'|'lit'} c.light   light level of the current room
   * @param {boolean} c.flashlight         flashlight on
   * @param {number} c.breathTime          seconds Space has been held (0 = not breathing)
   * @param {boolean} c.radio              radio playing in this room
   * @param {boolean} c.staring            looking straight at the portrait
   */
  update(dt, c) {
    const F = TUNING.fear;
    let rate;
    if (c.light === 'lit') rate = F.lit;
    else if (c.light === 'dim') rate = c.flashlight ? F.dimWithFlashlight : F.dim;
    else rate = c.flashlight ? F.darkWithFlashlight : F.dark;

    if (c.breathTime > F.breathWindup) rate = Math.min(rate, 0) + F.breathing;
    if (c.radio) rate += F.radio;
    if (c.staring) rate += F.portraitStare;

    this.rate = rate;
    this.add(rate * dt);
    return this.value;
  }
}
