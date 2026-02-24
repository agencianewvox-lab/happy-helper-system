import { useEffect, useRef } from "react";

/**
 * Plays a subtle notification sound when pending demands are detected.
 * Uses Web Audio API to generate a gentle two-tone chime (~2s).
 */
export function usePendingAlert(pendingCount: number) {
  const hasPlayed = useRef(false);
  const prevCount = useRef(0);

  useEffect(() => {
    // Only play when pendingCount increases (new pending items)
    if (pendingCount > 0 && pendingCount > prevCount.current && !hasPlayed.current) {
      hasPlayed.current = true;
      playNotificationSound();
      // Allow replaying after 60 seconds
      setTimeout(() => {
        hasPlayed.current = false;
      }, 60000);
    }
    prevCount.current = pendingCount;
  }, [pendingCount]);
}

function playNotificationSound() {
  try {
    const ctx = new AudioContext();
    const now = ctx.currentTime;

    // Gentle two-tone chime
    const frequencies = [523.25, 659.25, 783.99]; // C5, E5, G5 (major chord)

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

    // Close context after sound finishes
    setTimeout(() => ctx.close(), 2500);
  } catch {
    // Silently fail if audio not supported
  }
}
