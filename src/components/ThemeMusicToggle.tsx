import { useEffect, useMemo, useRef, useState } from 'react';
import { Disc3, VolumeX } from 'lucide-react';
import type { ThemeMusicPreset, ThemeMusicSource, ThemeTemplate } from '../theme/types';

interface ThemeMusicToggleProps {
  template: ThemeTemplate;
}

type Note = {
  freq: number;
  at: number;
  len: number;
  type?: OscillatorType;
};

type MidiNoteEvent = {
  tick: number;
  type: 'on' | 'off';
  channel: number;
  note: number;
  velocity: number;
};

type MidiTempoEvent = {
  tick: number;
  microsecondsPerQuarter: number;
};

type MidiScheduledNote = {
  midi: number;
  channel: number;
  start: number;
  duration: number;
  velocity: number;
};

type MidiSequence = {
  notes: MidiScheduledNote[];
  duration: number;
};

const MIDI_SEQUENCE_CACHE = new Map<string, Promise<MidiSequence>>();

const PRESET_NOTES: Record<ThemeMusicPreset, Note[]> = {
  'tech-pulse': [
    { freq: 220, at: 0, len: 0.12, type: 'sawtooth' },
    { freq: 330, at: 0.24, len: 0.09, type: 'triangle' },
    { freq: 277, at: 0.48, len: 0.12, type: 'sawtooth' },
    { freq: 440, at: 0.72, len: 0.1, type: 'triangle' },
    { freq: 392, at: 1.18, len: 0.14, type: 'sine' },
  ],
  'pixel-pop': [
    { freq: 523, at: 0, len: 0.08, type: 'square' },
    { freq: 659, at: 0.14, len: 0.08, type: 'square' },
    { freq: 784, at: 0.28, len: 0.08, type: 'square' },
    { freq: 1047, at: 0.42, len: 0.1, type: 'square' },
    { freq: 784, at: 0.62, len: 0.08, type: 'square' },
    { freq: 659, at: 0.76, len: 0.08, type: 'square' },
  ],
  'rh-pulse': [
    { freq: 196, at: 0, len: 0.11, type: 'sine' },
    { freq: 294, at: 0.18, len: 0.08, type: 'triangle' },
    { freq: 392, at: 0.36, len: 0.08, type: 'triangle' },
    { freq: 523, at: 0.72, len: 0.11, type: 'sine' },
    { freq: 440, at: 1.08, len: 0.08, type: 'triangle' },
    { freq: 659, at: 1.34, len: 0.1, type: 'sine' },
  ],
  'soft-pulse': [
    { freq: 174, at: 0, len: 0.32, type: 'sine' },
    { freq: 220, at: 0.28, len: 0.24, type: 'sine' },
    { freq: 261, at: 0.62, len: 0.28, type: 'triangle' },
    { freq: 196, at: 1.04, len: 0.32, type: 'sine' },
    { freq: 247, at: 1.42, len: 0.26, type: 'sine' },
  ],
  'wabi-drift': [
    { freq: 146, at: 0, len: 0.9, type: 'sine' },
    { freq: 220, at: 0.8, len: 0.6, type: 'sine' },
    { freq: 294, at: 1.6, len: 0.7, type: 'triangle' },
    { freq: 196, at: 2.4, len: 0.9, type: 'sine' },
  ],
  'vapor-drift': [
    { freq: 110, at: 0, len: 0.7, type: 'sine' },
    { freq: 165, at: 0.5, len: 0.6, type: 'triangle' },
    { freq: 220, at: 1.0, len: 0.6, type: 'sine' },
    { freq: 277, at: 1.5, len: 0.5, type: 'triangle' },
    { freq: 330, at: 2.0, len: 0.7, type: 'sine' },
  ],
  'utility-pulse': [
    { freq: 196, at: 0, len: 0.12, type: 'sine' },
    { freq: 247, at: 0.3, len: 0.14, type: 'triangle' },
    { freq: 294, at: 0.6, len: 0.16, type: 'sine' },
    { freq: 392, at: 0.9, len: 0.14, type: 'triangle' },
  ],
  'skeuo-hum': [
    { freq: 73, at: 0, len: 0.8, type: 'sine' },
    { freq: 110, at: 0.6, len: 0.6, type: 'sine' },
    { freq: 147, at: 1.2, len: 0.7, type: 'sine' },
    { freq: 220, at: 1.8, len: 0.5, type: 'triangle' },
  ],
  'retro-chime': [
    { freq: 523, at: 0, len: 0.1, type: 'square' },
    { freq: 659, at: 0.18, len: 0.1, type: 'square' },
    { freq: 784, at: 0.36, len: 0.1, type: 'square' },
    { freq: 1047, at: 0.54, len: 0.16, type: 'square' },
    { freq: 130, at: 0.9, len: 1.2, type: 'sine' },
  ],
  'ink-drift': [
    { freq: 146, at: 0, len: 1.2, type: 'sine' },
    { freq: 220, at: 0.9, len: 1.0, type: 'sine' },
    { freq: 196, at: 1.8, len: 1.1, type: 'sine' },
    { freq: 294, at: 2.8, len: 1.0, type: 'sine' },
  ],
  'tap-flow': [
    { freq: 110, at: 0, len: 0.36, type: 'sine' },
    { freq: 220, at: 0.18, len: 0.18, type: 'triangle' },
    { freq: 330, at: 0.48, len: 0.16, type: 'sine' },
    { freq: 247, at: 0.76, len: 0.22, type: 'triangle' },
    { freq: 440, at: 1.08, len: 0.14, type: 'sine' },
    { freq: 294, at: 1.38, len: 0.28, type: 'triangle' },
  ],
};

const PRESET_LOOP_SECONDS: Record<ThemeMusicPreset, number> = {
  'tech-pulse': 1.75,
  'pixel-pop': 1.08,
  'rh-pulse': 1.72,
  'soft-pulse': 1.84,
  'wabi-drift': 3.4,
  'vapor-drift': 3.0,
  'utility-pulse': 1.5,
  'skeuo-hum': 2.8,
  'retro-chime': 2.4,
  'ink-drift': 4.0,
  'tap-flow': 2.0,
};

function clampVolume(value?: number) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0.16;
  return Math.max(0, Math.min(value, 0.5));
}

function scheduleNote(ctx: AudioContext, master: GainNode, note: Note, startAt: number, volume: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const attack = 0.012;
  const release = 0.045;
  const noteStart = startAt + note.at;
  const noteEnd = noteStart + note.len;

  oscillator.type = note.type || 'sine';
  oscillator.frequency.setValueAtTime(note.freq, noteStart);
  gain.gain.setValueAtTime(0.0001, noteStart);
  gain.gain.exponentialRampToValueAtTime(Math.max(volume, 0.0001), noteStart + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd + release);

  oscillator.connect(gain);
  gain.connect(master);
  oscillator.start(noteStart);
  oscillator.stop(noteEnd + release + 0.02);
}

function isMidiUrl(url: string) {
  return /\.(mid|midi)(?:[?#]|$)/i.test(url) || /^data:audio\/(?:midi|x-midi|mid)/i.test(url);
}

function readAscii(bytes: Uint8Array, offset: number, length: number) {
  let output = '';
  for (let i = 0; i < length; i += 1) output += String.fromCharCode(bytes[offset + i] || 0);
  return output;
}

function readUInt16(bytes: Uint8Array, offset: number) {
  return ((bytes[offset] || 0) << 8) | (bytes[offset + 1] || 0);
}

function readUInt32(bytes: Uint8Array, offset: number) {
  return (
    ((bytes[offset] || 0) * 0x1000000) +
    ((bytes[offset + 1] || 0) << 16) +
    ((bytes[offset + 2] || 0) << 8) +
    (bytes[offset + 3] || 0)
  );
}

function readVariableLength(bytes: Uint8Array, state: { offset: number }) {
  let value = 0;
  for (let i = 0; i < 4 && state.offset < bytes.length; i += 1) {
    const byte = bytes[state.offset] || 0;
    state.offset += 1;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) break;
  }
  return value;
}

function midiFrequency(note: number) {
  return 440 * 2 ** ((note - 69) / 12);
}

function parseMidiSequence(buffer: ArrayBuffer): MidiSequence {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 14 || readAscii(bytes, 0, 4) !== 'MThd') {
    throw new Error('Invalid MIDI header');
  }

  const headerLength = readUInt32(bytes, 4);
  const trackCount = readUInt16(bytes, 10);
  const division = readUInt16(bytes, 12);
  if ((division & 0x8000) !== 0) {
    throw new Error('SMPTE MIDI timing is not supported');
  }

  const ticksPerQuarter = Math.max(1, division);
  const noteEvents: MidiNoteEvent[] = [];
  const tempoEvents: MidiTempoEvent[] = [{ tick: 0, microsecondsPerQuarter: 500000 }];
  let offset = 8 + headerLength;
  let tracksRead = 0;

  while (offset + 8 <= bytes.length && tracksRead < trackCount) {
    const chunkType = readAscii(bytes, offset, 4);
    const chunkLength = readUInt32(bytes, offset + 4);
    offset += 8;
    const chunkEnd = Math.min(bytes.length, offset + chunkLength);
    if (chunkType !== 'MTrk') {
      offset = chunkEnd;
      continue;
    }
    tracksRead += 1;

    const state = { offset };
    let tick = 0;
    let runningStatus = 0;
    while (state.offset < chunkEnd) {
      tick += readVariableLength(bytes, state);
      if (state.offset >= chunkEnd) break;
      let status = bytes[state.offset] || 0;
      state.offset += 1;
      if (status < 0x80) {
        if (!runningStatus) break;
        state.offset -= 1;
        status = runningStatus;
      } else if (status < 0xf0) {
        runningStatus = status;
      }

      if (status === 0xff) {
        const metaType = bytes[state.offset] || 0;
        state.offset += 1;
        const length = readVariableLength(bytes, state);
        if (metaType === 0x51 && length >= 3 && state.offset + 2 < chunkEnd) {
          tempoEvents.push({
            tick,
            microsecondsPerQuarter:
              ((bytes[state.offset] || 0) << 16) |
              ((bytes[state.offset + 1] || 0) << 8) |
              (bytes[state.offset + 2] || 0),
          });
        }
        state.offset = Math.min(chunkEnd, state.offset + length);
        if (metaType === 0x2f) break;
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        const length = readVariableLength(bytes, state);
        state.offset = Math.min(chunkEnd, state.offset + length);
        runningStatus = 0;
        continue;
      }

      const eventType = status & 0xf0;
      const channel = status & 0x0f;
      const data1 = bytes[state.offset] || 0;
      state.offset += 1;
      const needsSecondByte = eventType !== 0xc0 && eventType !== 0xd0;
      const data2 = needsSecondByte ? bytes[state.offset] || 0 : 0;
      if (needsSecondByte) state.offset += 1;

      if (eventType === 0x90 && data2 > 0) {
        noteEvents.push({ tick, type: 'on', channel, note: data1, velocity: data2 });
      } else if (eventType === 0x80 || (eventType === 0x90 && data2 === 0)) {
        noteEvents.push({ tick, type: 'off', channel, note: data1, velocity: 0 });
      }
    }
    offset = chunkEnd;
  }

  tempoEvents.sort((a, b) => a.tick - b.tick);
  const tickToSeconds = (targetTick: number) => {
    let seconds = 0;
    let previousTick = 0;
    let tempo = 500000;
    for (const event of tempoEvents) {
      if (event.tick > targetTick) break;
      seconds += ((event.tick - previousTick) * tempo) / (ticksPerQuarter * 1000000);
      previousTick = event.tick;
      tempo = event.microsecondsPerQuarter || tempo;
    }
    return seconds + ((targetTick - previousTick) * tempo) / (ticksPerQuarter * 1000000);
  };

  noteEvents.sort((a, b) => a.tick - b.tick || (a.type === 'off' ? -1 : 1));
  const activeNotes = new Map<string, MidiNoteEvent[]>();
  const scheduledNotes: MidiScheduledNote[] = [];
  const lastTick = Math.max(0, ...noteEvents.map((event) => event.tick));

  for (const event of noteEvents) {
    const key = `${event.channel}:${event.note}`;
    if (event.type === 'on') {
      const queue = activeNotes.get(key) || [];
      queue.push(event);
      activeNotes.set(key, queue);
      continue;
    }
    const queue = activeNotes.get(key);
    const startEvent = queue?.shift();
    if (!startEvent) continue;
    const start = tickToSeconds(startEvent.tick);
    const end = tickToSeconds(Math.max(event.tick, startEvent.tick + 1));
    scheduledNotes.push({
      midi: startEvent.note,
      channel: startEvent.channel,
      start,
      duration: Math.max(0.04, end - start),
      velocity: startEvent.velocity,
    });
  }

  for (const queue of activeNotes.values()) {
    for (const startEvent of queue) {
      const start = tickToSeconds(startEvent.tick);
      const end = tickToSeconds(Math.max(lastTick, startEvent.tick + ticksPerQuarter));
      scheduledNotes.push({
        midi: startEvent.note,
        channel: startEvent.channel,
        start,
        duration: Math.max(0.08, end - start),
        velocity: startEvent.velocity,
      });
    }
  }

  scheduledNotes.sort((a, b) => a.start - b.start);
  const duration = Math.max(2, scheduledNotes.reduce((max, note) => Math.max(max, note.start + note.duration), 0) + 0.6);
  return { notes: scheduledNotes.slice(0, 6000), duration };
}

async function loadMidiSequence(url: string) {
  const cached = MIDI_SEQUENCE_CACHE.get(url);
  if (cached) return cached;
  const pending = fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`Unable to load MIDI: ${response.status}`);
      return response.arrayBuffer();
    })
    .then(parseMidiSequence);
  MIDI_SEQUENCE_CACHE.set(url, pending);
  return pending;
}

function scheduleMidiNote(ctx: AudioContext, master: GainNode, note: MidiScheduledNote, startAt: number, volume: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const noteStart = startAt + note.start;
  const duration = Math.max(0.04, Math.min(note.duration, note.channel === 9 ? 0.12 : 8));
  const noteEnd = noteStart + duration;
  const peak = Math.max(0.0001, volume * (note.velocity / 127) * (note.channel === 9 ? 0.12 : 0.24));

  oscillator.type = note.channel === 9 ? 'square' : note.midi < 48 ? 'triangle' : 'sine';
  oscillator.frequency.setValueAtTime(note.channel === 9 ? 70 + (note.midi % 24) * 10 : midiFrequency(note.midi), noteStart);
  gain.gain.setValueAtTime(0.0001, noteStart);
  gain.gain.exponentialRampToValueAtTime(peak, noteStart + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd + 0.06);

  oscillator.connect(gain);
  gain.connect(master);
  oscillator.start(noteStart);
  oscillator.stop(noteEnd + 0.08);
}

export default function ThemeMusicToggle({ template }: ThemeMusicToggleProps) {
  const [enabled, setEnabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const timerRef = useRef<number | null>(null);
  const enabledRef = useRef(false);

  const music = useMemo(() => {
    return template.music;
  }, [
    template.music,
  ]);

  const title = music?.title || 'Theme Music';
  const preset = music?.preset || 'tech-pulse';
  const volume = clampVolume(music?.volume);
  const musicKey = `${template.id}|normal|${music?.preset || ''}|${music?.source || ''}|${music?.url || ''}|${volume}`;

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const stop = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (masterGainRef.current) {
      masterGainRef.current.disconnect();
      masterGainRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
  };

  const playUrl = async (url: string) => {
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = volume;
    audioRef.current = audio;
    await audio.play();
  };

  const playMidiUrl = async (url: string) => {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor() as AudioContext;
    const master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    audioCtxRef.current = ctx;
    masterGainRef.current = master;
    if (ctx.state === 'suspended') await ctx.resume();

    const sequence = await loadMidiSequence(url);
    const playLoop = () => {
      if (audioCtxRef.current !== ctx) return;
      const startAt = ctx.currentTime + 0.04;
      sequence.notes.forEach((note) => scheduleMidiNote(ctx, master, note, startAt, volume));
    };

    playLoop();
    timerRef.current = window.setInterval(playLoop, Math.max(2, sequence.duration) * 1000);
  };

  const playSynth = async () => {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor() as AudioContext;
    const master = ctx.createGain();
    master.gain.value = 0.75;
    master.connect(ctx.destination);
    audioCtxRef.current = ctx;
    masterGainRef.current = master;
    if (ctx.state === 'suspended') await ctx.resume();

    const notes = PRESET_NOTES[preset] || PRESET_NOTES['tech-pulse'];
    const loopSeconds = PRESET_LOOP_SECONDS[preset] || PRESET_LOOP_SECONDS['tech-pulse'];
    const playLoop = () => {
      const startAt = ctx.currentTime + 0.015;
      notes.forEach((note) => scheduleNote(ctx, master, note, startAt, volume));
    };

    playLoop();
    timerRef.current = window.setInterval(playLoop, loopSeconds * 1000);
  };

  const playCurrentMusic = async () => {
    stop();
    try {
      if ((music?.source === 'url' || music?.source === 'upload') && music.url?.trim()) {
        const url = music.url.trim();
        if (isMidiUrl(url)) {
          await playMidiUrl(url);
        } else {
          await playUrl(url);
        }
      } else {
        await playSynth();
      }
      setEnabled(true);
      enabledRef.current = true;
    } catch (error) {
      stop();
      setEnabled(false);
      enabledRef.current = false;
      console.warn('[theme-music] unable to start theme music', error);
    }
  };

  const toggle = async () => {
    if (enabled) {
      stop();
      setEnabled(false);
      enabledRef.current = false;
      return;
    }
    await playCurrentMusic();
  };

  useEffect(() => {
    const wasPlaying = enabledRef.current;
    stop();
    if (wasPlaying) {
      void playCurrentMusic();
    } else {
      setEnabled(false);
      enabledRef.current = false;
    }
    return stop;
  }, [musicKey]);

  return (
    <button
      type="button"
      className={`t8-theme-music-toggle nodrag nopan ${enabled ? 'is-playing' : ''}`}
      onClick={toggle}
      title={enabled ? `关闭主题音乐：${title}` : `播放主题音乐：${title}`}
      aria-label={enabled ? `关闭主题音乐：${title}` : `播放主题音乐：${title}`}
      aria-pressed={enabled}
    >
      {enabled ? <Disc3 size={18} /> : <VolumeX size={18} />}
    </button>
  );
}
