let ctx: AudioContext | null = null;

/** Sirena sintética (sin necesidad de archivos de audio) para captar la atención en una alerta crítica. */
export function playSiren(durationMs = 2500) {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05);

    const start = ctx.currentTime;
    const end = start + durationMs / 1000;
    const step = 0.35; // segundos por barrido de tono, imitando una sirena
    for (let t = start; t < end; t += step) {
      osc.frequency.setValueAtTime(600, t);
      osc.frequency.linearRampToValueAtTime(1000, t + step / 2);
      osc.frequency.linearRampToValueAtTime(600, t + step);
    }
    gain.gain.setValueAtTime(0.3, end - 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, end);

    osc.start(start);
    osc.stop(end + 0.05);
  } catch {
    // Web Audio no disponible: la alerta visual sigue funcionando igualmente.
  }
}
