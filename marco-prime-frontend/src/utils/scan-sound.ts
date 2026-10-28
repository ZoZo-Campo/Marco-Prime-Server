let audioContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  try {
    if (!audioContext) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      audioContext = new Ctor();
    }
    if (audioContext.state === "suspended") void audioContext.resume();
    return audioContext;
  } catch {
    return null;
  }
}

function tone(
  context: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume = 0.4,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function buzz() {
  try {
    if ("vibrate" in navigator) navigator.vibrate(120);
  } catch {
    /* indiponible */
  }
}

export function playItemFeedback() {
  const context = getContext();
  if (!context) return;
  const now = context.currentTime;
  tone(context, 1568, now, 0.09, 0.3);
}

export function playScanFeedback(kind: "ok" | "error") {
  buzz();
  const context = getContext();
  if (!context) return;
  const now = context.currentTime;
  if (kind === "ok") {
    tone(context, 988, now, 0.14, 0.5);
    tone(context, 1319, now + 0.12, 0.2, 0.5);
  } else {
    tone(context, 220, now, 0.28, 0.5);
    tone(context, 165, now + 0.28, 0.3, 0.5);
  }
}