// ─── Soundscapes — procedural ambience via Web Audio ───────────────
// Zero audio assets, zero network: everything is synthesized, which
// keeps the app fully offline-first. Each soundscape is a small node
// graph off a shared looping noise buffer, crossfaded on switch.
//
//   Rain  — pink-noise hiss (lowpassed) + random droplet pings
//   Waves — brown-noise swell, gain ridden by two slow LFOs
//   Café  — lowpassed pink murmur + random glass clinks

export type SoundscapeName = "Silence" | "Rain" | "Café" | "Waves";

export const SOUNDSCAPES: SoundscapeName[] = ["Silence", "Rain", "Café", "Waves"];

type NoiseKind = "white" | "pink" | "brown";

interface Handle {
  gain: GainNode;
  stop: () => void;
}

class SoundscapeEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<NoiseKind, AudioBuffer>();
  private current: { name: SoundscapeName; handle: Handle } | null = null;

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  private noiseBuffer(kind: NoiseKind): AudioBuffer {
    const cached = this.buffers.get(kind);
    if (cached) return cached;
    const ctx = this.ctx!;
    const seconds = kind === "brown" ? 4 : 2; // longer loop hides repetition in brown
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (kind === "white") {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } else if (kind === "pink") {
      // Paul Kellet's filter
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    this.buffers.set(kind, buf);
    return buf;
  }

  private loopNoise(kind: NoiseKind): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuffer(kind);
    src.loop = true;
    return src;
  }

  // ─── Rain ──────────────────────────────────────────────────────────
  private buildRain(out: GainNode): () => void {
    const ctx = this.ctx!;
    const hiss = this.loopNoise("pink");
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1900;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 300;
    const hissGain = ctx.createGain();
    hissGain.gain.value = 0.55;
    hiss.connect(hp).connect(lp).connect(hissGain).connect(out);
    hiss.start();

    // Droplet pings — short band-passed noise bursts at random intervals
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const droplet = () => {
      if (!alive) return;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer("white");
      src.playbackRate.value = 0.8 + Math.random() * 0.9;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1500 + Math.random() * 4500;
      bp.Q.value = 9 + Math.random() * 6;
      const env = ctx.createGain();
      const t = ctx.currentTime;
      const peak = 0.02 + Math.random() * 0.05;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(peak, t + 0.012);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.08);
      src.connect(bp).connect(env).connect(out);
      src.start(t, Math.random() * 1.5, 0.2);
      timer = setTimeout(droplet, 60 + Math.random() * 220);
    };
    timer = setTimeout(droplet, 100);

    return () => {
      alive = false;
      clearTimeout(timer);
      try {
        hiss.stop();
      } catch {
        /* already stopped */
      }
    };
  }

  // ─── Waves ─────────────────────────────────────────────────────────
  private buildWaves(out: GainNode): () => void {
    const ctx = this.ctx!;
    const surf = this.loopNoise("brown");
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 520;
    const swell = ctx.createGain();
    swell.gain.value = 0.38;
    surf.connect(lp).connect(swell).connect(out);
    surf.start();

    // Two slow LFOs riding the swell gain → irregular ocean rhythm
    const base = ctx.createConstantSource();
    base.offset.value = 0.38;
    base.connect(swell.gain);
    base.start();
    const oscs: OscillatorNode[] = [];
    for (const [freq, depth] of [
      [0.07, 0.22],
      [0.029, 0.12],
    ] as const) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = depth;
      lfo.connect(g).connect(swell.gain);
      lfo.start();
      oscs.push(lfo);
    }

    return () => {
      try {
        surf.stop();
        base.stop();
        oscs.forEach((o) => o.stop());
      } catch {
        /* already stopped */
      }
    };
  }

  // ─── Café ──────────────────────────────────────────────────────────
  private buildCafe(out: GainNode): () => void {
    const ctx = this.ctx!;
    const murmur = this.loopNoise("pink");
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 750;
    const murmurGain = ctx.createGain();
    murmurGain.gain.value = 0.3;
    murmur.connect(lp).connect(murmurGain).connect(out);
    murmur.start();

    // Slow chatter swell on the murmur
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.15;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.08;
    lfo.connect(lfoG).connect(murmurGain.gain);
    lfo.start();

    // Random glass clinks
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const clink = () => {
      if (!alive) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 1500 + Math.random() * 2500;
      const env = ctx.createGain();
      const peak = 0.012 + Math.random() * 0.025;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(peak, t + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.2 + Math.random() * 0.25);
      osc.connect(env).connect(out);
      osc.start(t);
      osc.stop(t + 0.6);
      timer = setTimeout(clink, 1500 + Math.random() * 4500);
    };
    timer = setTimeout(clink, 800);

    return () => {
      alive = false;
      clearTimeout(timer);
      try {
        murmur.stop();
        lfo.stop();
      } catch {
        /* already stopped */
      }
    };
  }

  // ─── Public API ────────────────────────────────────────────────────
  get playing(): SoundscapeName {
    return this.current?.name ?? "Silence";
  }

  get running(): boolean {
    return this.ctx?.state === "running";
  }

  play(name: SoundscapeName): void {
    if (name === "Silence") {
      this.stop();
      return;
    }
    if (this.current?.name === name) return;
    const ctx = this.ensureCtx();

    // Fade out the previous scene
    const prev = this.current;
    if (prev) {
      const t = ctx.currentTime;
      prev.handle.gain.gain.setValueAtTime(prev.handle.gain.gain.value, t);
      prev.handle.gain.gain.linearRampToValueAtTime(0, t + 0.5);
      setTimeout(() => {
        prev.handle.stop();
        prev.handle.gain.disconnect();
      }, 600);
    }

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master!);
    const stopGraph =
      name === "Rain" ? this.buildRain(gain) : name === "Waves" ? this.buildWaves(gain) : this.buildCafe(gain);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.8);
    this.current = { name, handle: { gain, stop: stopGraph } };
  }

  stop(): void {
    if (!this.current || !this.ctx) {
      this.current = null;
      return;
    }
    const prev = this.current;
    this.current = null;
    const t = this.ctx.currentTime;
    prev.handle.gain.gain.setValueAtTime(prev.handle.gain.gain.value, t);
    prev.handle.gain.gain.linearRampToValueAtTime(0, t + 0.4);
    setTimeout(() => {
      prev.handle.stop();
      prev.handle.gain.disconnect();
    }, 500);
  }
}

export const soundscapeEngine = new SoundscapeEngine();

// Test/debug handle (harmless in prod, used by E2E)
if (typeof window !== "undefined") {
  (window as unknown as { __soundscapeEngine: SoundscapeEngine }).__soundscapeEngine =
    soundscapeEngine;
}
