/**
 * Dev-only scripted rider, loaded by hand from the console during development:
 *   await import('/dev-driver.js'); __sync.install(); __sync.run(12);
 *
 * It drives the engine through the same dispatch path the UI uses, with the clock advanced
 * synchronously — which is how the scene gets inspected at an exact distance-to-conflict
 * without hand-riding a twenty-second approach. Not imported by the app.
 */
window.__sync = {
  install() {
    const en = window.__avd.engine;
    window.__avd.start();
    en.stop(); // drop the animation frame loop; we drive the clock ourselves
    this.en = en;
    this.done = {};
    this.braking = false;
    return 'armed';
  },
  once(k, fn) {
    if (!this.done[k]) { this.done[k] = true; fn(); }
  },
  run(until, plan) {
    const en = this.en;
    const p = Object.assign(
      { mirrors: 1, indicator: 1, eyes: 1, shoulderPrep: 1, shoulder: 1, steer: 1, yieldTo: 1, gear: 1, slow: 1, off: 'direct' },
      plan || {},
    );
    const D = (c, ph = 'press') => en.dispatch(c, ph, 'keyboard');
    let guard = 0;
    while (guard++ < 20000) {
      en.advance(1 / 60);
      if (en.phase === 'finished') break;
      if (en.phase !== 'riding') continue;
      const d = en.distanceToConflict();
      if (p.eyes && d <= 90) this.once('eyeL', () => D('EYE_LEFT'));
      if (p.mirrors && d <= 80) this.once('mirL', () => D('MIRROR_LEFT'));
      if (p.eyes && d <= 70) this.once('eyeR', () => D('EYE_RIGHT'));
      if (p.mirrors && d <= 60) this.once('mirR', () => D('MIRROR_RIGHT'));
      if (p.signalEarly && d <= 58) this.once('indEarly', () => D('INDICATOR_RIGHT'));
      if (p.shoulderPrep && d <= 50) this.once('shPrep', () => D('SHOULDER_RIGHT'));
      if (p.indicator && d <= 40) this.once('ind', () => D('INDICATOR_RIGHT'));
      if (p.slow && d <= 44) this.once('th', () => { let g = 0; while (en.bike.targetSpeed * 3.6 > 15.5 && g++ < 20) D('THROTTLE_DOWN'); });
      if (p.gear && d <= 32) this.once('gr', () => { D('CLUTCH', 'down'); D('GEAR_DOWN'); D('CLUTCH', 'up'); });
      if (p.eyes && d <= 24) this.once('eyeLFinal', () => D('EYE_LEFT'));
      if (p.shoulder && d <= 14) this.once('sh', () => D('SHOULDER_RIGHT'));
      if (p.steer && d <= 11) this.once('st', () => D('STEER_RIGHT'));
      const past = en.actors[0].y > en.routes.crossYSpan[1] + 1.5;
      const want = p.yieldTo && d <= 12 && !past;
      if (want !== this.braking) { this.braking = want; D('BRAKE', want ? 'down' : 'up'); }
      const ta = en.getTurnCompletedAt();
      if (ta !== null) {
        if (p.off === 'direct') this.once('off', () => D('INDICATOR_OFF'));
        this.once('up', () => { D('THROTTLE_UP'); D('THROTTLE_UP'); });
      }
      if (until !== null && d <= until) break;
    }
    const a = en.actors[0];
    return JSON.stringify({
      phase: en.phase, t: +en.t.toFixed(2), d: +en.distanceToConflict().toFixed(1),
      v: +(en.bike.speed * 3.6).toFixed(1), seen: a.perceived, mode: a.mode,
      gazes: en.gazes.map((g) => g.control),
      bike: [+en.bike.pose.x.toFixed(1), +en.bike.pose.y.toFixed(1)],
      actor: [+a.x.toFixed(1), +a.y.toFixed(1)],
    });
  },
};
