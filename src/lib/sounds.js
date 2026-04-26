// Shared completion chime used both by App.jsx (after a successful dictation)
// and by ControlPanel.jsx (preview button in Settings). A single definition
// keeps both sites in sync if we ever change the tone.
//
// Tone: two-note sine chime, C5 -> E5, ~250 ms total.
// Returns silently if Web Audio is unavailable.
export function playCompletionChime(volumeMultiplier = 1) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const audioContext = new Ctx();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
    oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5

    const peak = 0.4 * volumeMultiplier;
    const tail = 0.3 * volumeMultiplier;
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(peak, audioContext.currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(tail, audioContext.currentTime + 0.1);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.25);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.25);

    oscillator.onended = () => audioContext.close();
  } catch (e) {
    // Non-fatal; sound is a nice-to-have. Caller already swallows errors.
    console.log('[sounds] playCompletionChime failed:', e);
  }
}
