"use client";

// ─── Soundscape engine — procedural ambient audio via Web Audio ────
// No audio files, no network: everything is synthesized live from
// filtered noise buffers (keeps the app fully offline / PWA-safe).
//   White   — flat-spectrum noise (masks distractions, boosts focus)
//   Brown   — deep low-end rumble (calming, great for deep work)
//   Pink    — 1/f noise, most "natural"-sounding (rain-on-leaves-ish)
//   Rain    — white noise lowpassed + random high droplet blips
//   Café    — brown-noise room rumble + bandpassed murmur + cup clinks
//   Waves   — brown noise with slow LFO swells
//   Fire    — pink-noise crackle bed + low brown rumble + pops
//   Wind    — pink noise with slow LFO gusts + bandpass sweeps
// The engine is a singleton; AudioContext is created lazily inside a
// user gesture (the select's change event) to satisfy autoplay policy.

export type SoundscapeName =
  | "Silence"
  | "White"
  | "Brown"
  | "Pink"
  | "Rain"
  | "Café"
  | "Waves"
  | "Fire"
  | "Wind";

type Stoppable = { stop: () => void };

class SoundscapeEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timers: number[] = [];
  private stoppables: Stoppable[] = [];
  private whiteBuf: AudioBuffer | null = null;
  private brownBuf: AudioBuffer | null = null;
  private pinkBuf: AudioBuffer | null = null;
  currentName: SoundscapeName = "Silence";

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private noiseBuffer(kind: "white" | "brown" | "pink"): AudioBuffer {
    const ctx = this.ensureCtx();
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    if (kind === "white") {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } else if (kind === "brown") {
      // Paul Kellet's brown-noise approximation
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      }
    } else {
      // Voss-McCartney pink noise (1/f spectrum) — most natural-sounding
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    }
    return buf;
  }

  private loopNoise(kind: "white" | "brown" | "pink"): AudioBufferSourceNode {
    const ctx = this.ensureCtx();
    if (kind === "white" && !this.whiteBuf) this.whiteBuf = this.noiseBuffer("white");
    if (kind === "brown" && !this.brownBuf) this.brownBuf = this.noiseBuffer("brown");
    if (kind === "pink" && !this.pinkBuf) this.pinkBuf = this.noiseBuffer("pink");
    const src = ctx.createBufferSource();
    src.buffer =
      kind === "white" ? this.whiteBuf! : kind === "brown" ? this.brownBuf! : this.pinkBuf!;
    src.loop = true;
    this.stoppables.push(src);
    return src;
  }

  private filter(
    type: BiquadFilterType,
    frequency: number,
    Q = 0.7
  ): BiquadFilterNode {
    const ctx = this.ensureCtx();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = Q;
    return f;
  }

  private gain(value: number): GainNode {
    const ctx = this.ensureCtx();
    const g = ctx.createGain();
    g.gain.value = value;
    return g;
  }

  // ─── Sound recipes ────────────────────────────────────────────────

  private buildWhite(master: GainNode) {
    // Pure flat-spectrum white noise — tames a noisy environment
    const src = this.loopNoise("white");
    const g = this.gain(0.18);
    src.connect(g).connect(master);
    src.start();
  }

  private buildBrown(master: GainNode) {
    // Deep brown noise — low rumble, calming
    const src = this.loopNoise("brown");
    const lp = this.filter("lowpass", 800, 0.5);
    const hp = this.filter("highpass", 30, 0.5); // kill DC drift
    const g = this.gain(0.55);
    src.connect(lp).connect(hp).connect(g).connect(master);
    src.start();
  }

  private buildPink(master: GainNode) {
    // Pink noise — 1/f, most natural for masking
    const src = this.loopNoise("pink");
    const g = this.gain(0.42);
    src.connect(g).connect(master);
    src.start();
  }

  private buildFire(master: GainNode) {
    const ctx = this.ensureCtx();
    // Hiss bed — pink noise bandpassed
    const hiss = this.loopNoise("pink");
    const bp = this.filter("bandpass", 1200, 0.8);
    const hissGain = this.gain(0.18);
    hiss.connect(bp).connect(hissGain).connect(master);
    hiss.start();

    // Low brown rumble for the body of the fire
    const rumble = this.loopNoise("brown");
    const lp = this.filter("lowpass", 250, 0.5);
    const rG = this.gain(0.3);
    rumble.connect(lp).connect(rG).connect(master);
    rumble.start();

    // Random pops — short high-frequency bursts
    const pop = () => {
      const t = ctx.currentTime;
      const ns = ctx.createBufferSource();
      ns.buffer = this.pinkBuf!;
      const popBp = this.filter("bandpass", 3000 + Math.random() * 2000, 6);
      const pg = ctx.createGain();
      pg.gain.setValueAtTime(0.0001, t);
      pg.gain.exponentialRampToValueAtTime(0.04 + Math.random() * 0.06, t + 0.003);
      pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.04 + Math.random() * 0.05);
      ns.connect(popBp).connect(pg).connect(master);
      ns.start(t);
      ns.stop(t + 0.12);
    };
    this.timers.push(
      window.setInterval(() => {
        if (Math.random() < 0.5) pop();
      }, 700)
    );
  }

  private buildWind(master: GainNode) {
    const ctx = this.ensureCtx();
    // Pink noise gusts — slow LFO on a bandpass + a deeper LFO on the gain
    const src = this.loopNoise("pink");
    const bp = this.filter("bandpass", 700, 1.2);
    const g = this.gain(0.3);

    const lfo1 = ctx.createOscillator();
    lfo1.type = "sine";
    lfo1.frequency.value = 0.13;
    const d1 = this.gain(220);
    lfo1.connect(d1).connect(bp.frequency);
    lfo1.start();
    this.stoppables.push(lfo1);

    const lfo2 = ctx.createOscillator();
    lfo2.type = "sine";
    lfo2.frequency.value = 0.08;
    const d2 = this.gain(0.18);
    lfo2.connect(d2).connect(g.gain);
    lfo2.start();
    this.stoppables.push(lfo2);

    src.connect(bp).connect(g).connect(master);
    src.start();
  }

  private buildRain(master: GainNode) {
    const ctx = this.ensureCtx();
    // Steady rainfall bed
    const bed = this.loopNoise("white");
    const lp = this.filter("lowpass", 1400, 0.6);
    const bedGain = this.gain(0.22);
    bed.connect(lp).connect(bedGain).connect(master);
    bed.start();

    // Individual droplets — short bandpassed blips at random pitch
    const droplet = () => {
      const t = ctx.currentTime;
      const ns = ctx.createBufferSource();
      ns.buffer = this.whiteBuf!;
      const bp = this.filter("bandpass", 2500 + Math.random() * 3500, 9);
      const dg = ctx.createGain();
      dg.gain.setValueAtTime(0.0001, t);
      dg.gain.exponentialRampToValueAtTime(0.03 + Math.random() * 0.05, t + 0.005);
      dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.06);
      ns.connect(bp).connect(dg).connect(master);
      ns.start(t);
      ns.stop(t + 0.15);
    };
    this.timers.push(
      window.setInterval(() => {
        if (Math.random() < 0.6) droplet();
      }, 180)
    );
  }

  private buildCafe(master: GainNode) {
    const ctx = this.ensureCtx();
    // Room rumble
    const rumble = this.loopNoise("brown");
    const rlp = this.filter("lowpass", 350, 0.5);
    const rumbleGain = this.gain(0.35);
    rumble.connect(rlp).connect(rumbleGain).connect(master);
    rumble.start();

    // Crowd murmur — bandpassed noise with slow random swell
    const murmur = this.loopNoise("brown");
    const mbp = this.filter("bandpass", 600, 0.9);
    const murmurGain = this.gain(0.1);
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.25;
    const lfoDepth = this.gain(0.05);
    lfo.connect(lfoDepth).connect(murmurGain.gain);
    lfo.start();
    this.stoppables.push(lfo);
    murmur.connect(mbp).connect(murmurGain).connect(master);
    murmur.start();

    // Cup clinks — decaying sine pings
    const clink = () => {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 1500 + Math.random() * 2000;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.exponentialRampToValueAtTime(0.02 + Math.random() * 0.015, t + 0.008);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25 + Math.random() * 0.2);
      osc.connect(cg).connect(master);
      osc.start(t);
      osc.stop(t + 0.6);
    };
    this.timers.push(
      window.setInterval(() => {
        if (Math.random() < 0.4) clink();
      }, 2500)
    );
  }

  private buildWaves(master: GainNode) {
    const ctx = this.ensureCtx();
    const surf = this.loopNoise("brown");
    const lp = this.filter("lowpass", 550, 0.4);
    const hp = this.filter("highpass", 40, 0.5); // kill DC drift
    const surfGain = this.gain(0.45);

    // Two out-of-phase LFOs → organic swell/retreat
    const lfo1 = ctx.createOscillator();
    lfo1.type = "sine";
    lfo1.frequency.value = 0.12;
    const depth1 = this.gain(0.3);
    lfo1.connect(depth1).connect(surfGain.gain);
    lfo1.start();
    this.stoppables.push(lfo1);

    const lfo2 = ctx.createOscillator();
    lfo2.type = "sine";
    lfo2.frequency.value = 0.05;
    const depth2 = this.gain(0.12);
    lfo2.connect(depth2).connect(surfGain.gain);
    lfo2.start();
    this.stoppables.push(lfo2);

    surf.connect(lp).connect(hp).connect(surfGain).connect(master);
    surf.start();
  }

  // ─── Public API ───────────────────────────────────────────────────

  play(name: SoundscapeName) {
    this.teardown();
    this.currentName = name;
    if (name === "Silence") return;

    const ctx = this.ensureCtx();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.connect(ctx.destination);
    this.master = master;

    if (name === "White") this.buildWhite(master);
    else if (name === "Brown") this.buildBrown(master);
    else if (name === "Pink") this.buildPink(master);
    else if (name === "Fire") this.buildFire(master);
    else if (name === "Wind") this.buildWind(master);
    else if (name === "Rain") this.buildRain(master);
    else if (name === "Café") this.buildCafe(master);
    else if (name === "Waves") this.buildWaves(master);

    // Fade in — no click
    master.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 0.8);
  }

  stop() {
    this.teardown();
    this.currentName = "Silence";
  }

  private teardown() {
    const ctx = this.ctx;
    const master = this.master;
    const stoppables = this.stoppables;
    if (ctx && master) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      window.setTimeout(() => {
        for (const s of stoppables) {
          try {
            s.stop();
          } catch {
            /* already stopped */
          }
        }
        try {
          master.disconnect();
        } catch {
          /* already disconnected */
        }
      }, 500);
    }
    this.timers.forEach((id) => window.clearInterval(id));
    this.timers = [];
    this.stoppables = [];
    this.master = null;
  }
}

export const soundscape = new SoundscapeEngine();

// Test/debug probe (harmless in prod — lets E2E assert engine state)
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__soundscape = soundscape;
}
