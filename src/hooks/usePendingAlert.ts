import { useEffect, useRef } from "react";

/**
 * Plays a subtle notification sound when pending demands are detected.
 */
export function usePendingAlert(pendingCount: number) {
  const hasPlayed = useRef(false);
  const prevCount = useRef(0);

  useEffect(() => {
    if (pendingCount > 0 && pendingCount > prevCount.current && !hasPlayed.current) {
      hasPlayed.current = true;
      playChimeSound();
      setTimeout(() => { hasPlayed.current = false; }, 60000);
    }
    prevCount.current = pendingCount;
  }, [pendingCount]);
}

/**
 * Plays an alert siren when high-risk clients are detected.
 */
export function useHighRiskAlert(highRiskCount: number) {
  const hasPlayed = useRef(false);
  const prevCount = useRef(0);

  useEffect(() => {
    if (highRiskCount > 0 && highRiskCount > prevCount.current && !hasPlayed.current) {
      hasPlayed.current = true;
      playSirenSound();
      setTimeout(() => { hasPlayed.current = false; }, 60000);
    }
    prevCount.current = highRiskCount;
  }, [highRiskCount]);
}

function playChimeSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    const frequencies = [523.25, 659.25, 783.99];
    frequencies.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.3);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.3 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.3 + 0.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.3);
      osc.stop(now + i * 0.3 + 0.7);
    });
    setTimeout(() => ctx.close(), 2500);
  } catch { /* silent */ }
}

function playSirenSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Two-tone siren effect (~2 seconds)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    // Oscillate between two frequencies to create siren effect
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(900, now + 0.5);
    osc.frequency.linearRampToValueAtTime(600, now + 1.0);
    osc.frequency.linearRampToValueAtTime(900, now + 1.5);
    osc.frequency.linearRampToValueAtTime(600, now + 2.0);

    // Gentle volume envelope
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.1);
    gain.gain.setValueAtTime(0.12, now + 1.8);
    gain.gain.linearRampToValueAtTime(0, now + 2.0);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 2.1);

    setTimeout(() => ctx.close(), 2500);
  } catch { /* silent */ }
}
