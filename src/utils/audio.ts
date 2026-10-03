// Web Audio API beep synthesizer for barcode scanner feedback
class SoundFX {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private getContext(): AudioContext | null {
    if (!this.enabled) return null;
    if (typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  // Pleasant high-pitched beep when a barcode is scanned successfully
  playSuccess() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1760, now); // A6 note
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // Ignore audio failure
    }
  }

  // Melodic chime when batch scanning / importing multiple orders
  playBatchSuccess() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1760, now + 0.15);

      osc2.frequency.setValueAtTime(1174, now + 0.05);
      osc2.frequency.exponentialRampToValueAtTime(2349, now + 0.22);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now + 0.05);
      osc1.stop(now + 0.2);
      osc2.stop(now + 0.25);
    } catch {
      // Ignore audio failure
    }
  }

  // Warning buzz when a barcode has already been scanned (duplicate prevention)
  playDuplicate() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sawtooth';
      osc2.type = 'square';
      osc1.frequency.setValueAtTime(260, now);
      osc2.frequency.setValueAtTime(310, now);

      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.3);
      osc2.stop(now + 0.3);
    } catch {
      // Ignore
    }
  }

  // Error buzz
  playError() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.16);
    } catch {
      // Ignore
    }
  }

  // Voice announcement of the number of notas in Indonesian (Chime + Speech Synthesis)
  speakNotaCount(count: number, context?: 'belum_packing' | 'sudah_packing' | string) {
    if (!this.enabled) return;

    // 1. Play melodic batch chime immediately for instant audio feedback
    this.playBatchSuccess();

    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    try {
      window.speechSynthesis.cancel();

      const words = numberToIndonesianWords(count);
      let phrase = `${words} nota`;

      if (context === 'belum_packing') {
        phrase = `${words} nota belum packing berhasil disimpan`;
      } else if (context === 'sudah_packing') {
        phrase = `${words} nota sudah packing berhasil disimpan`;
      } else {
        phrase = `${words} nota berhasil disimpan`;
      }

      const utterance = new SpeechSynthesisUtterance(phrase);
      utterance.lang = 'id-ID';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      // Pick Indonesian voice if available in the browser
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const idVoice = voices.find(
          (v) =>
            v.lang === 'id-ID' ||
            v.lang.startsWith('id') ||
            v.name.toLowerCase().includes('indonesia') ||
            v.name.toLowerCase().includes('id_id')
        );
        if (idVoice) {
          utterance.voice = idVoice;
        }
      }

      // Small 320ms delay so chime sounds clearly first before speech starts
      setTimeout(() => {
        try {
          if (this.enabled) {
            window.speechSynthesis.speak(utterance);
          }
        } catch (e) {
          console.warn('Speech synthesis speak error:', e);
        }
      }, 320);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  }
}

/**
 * Converts integer numbers to Indonesian words (terbilang)
 * e.g. 1 -> satu, 12 -> dua belas, 35 -> tiga puluh lima, 100 -> seratus
 */
export function numberToIndonesianWords(num: number): string {
  if (num === 0) return 'nol';
  if (num < 0) return 'minus ' + numberToIndonesianWords(Math.abs(num));

  const satuan = [
    '',
    'satu',
    'dua',
    'tiga',
    'empat',
    'lima',
    'enam',
    'tujuh',
    'delapan',
    'sembilan',
    'sepuluh',
    'sebelas',
  ];

  if (num < 12) {
    return satuan[num];
  } else if (num < 20) {
    return satuan[num - 10] + ' belas';
  } else if (num < 100) {
    const s = Math.floor(num / 10);
    const rest = num % 10;
    return satuan[s] + ' puluh' + (rest > 0 ? ' ' + satuan[rest] : '');
  } else if (num < 200) {
    const rest = num % 100;
    return 'seratus' + (rest > 0 ? ' ' + numberToIndonesianWords(rest) : '');
  } else if (num < 1000) {
    const s = Math.floor(num / 100);
    const rest = num % 100;
    return satuan[s] + ' ratus' + (rest > 0 ? ' ' + numberToIndonesianWords(rest) : '');
  } else if (num < 2000) {
    const rest = num % 1000;
    return 'seribu' + (rest > 0 ? ' ' + numberToIndonesianWords(rest) : '');
  } else if (num < 1000000) {
    const s = Math.floor(num / 1000);
    const rest = num % 1000;
    return numberToIndonesianWords(s) + ' ribu' + (rest > 0 ? ' ' + numberToIndonesianWords(rest) : '');
  }
  return num.toString();
}

// Pre-load voices on load
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  try {
    window.speechSynthesis.onvoiceschanged = () => {
      try {
        window.speechSynthesis.getVoices();
      } catch {}
    };
  } catch {}
}

export const soundFX = new SoundFX();

export const speakNotaCount = (
  count: number,
  context?: 'belum_packing' | 'sudah_packing' | string
) => {
  soundFX.speakNotaCount(count, context);
};
