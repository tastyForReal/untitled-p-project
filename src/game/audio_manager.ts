import { log_error, log_message, log_warning } from './logger.js';
import { MIDI_TO_NOTE, MidiJson } from './midi_types.js';

const GAME_OVER_NOTES: string[] = ['c.mp3', 'e.mp3', 'g.mp3'];
const AUDIO_SAMPLES_PATH: string = 'assets/sounds/mp3/piano/';

export class AudioManager {
    private audio_context: AudioContext | null = null;
    private audio_buffers: Map<string, AudioBuffer> = new Map();
    private active_sources: Set<AudioBufferSourceNode> = new Set();
    private is_initialized: boolean = false;
    private sample_names: string[] = [];
    private midi_data: MidiJson | null = null;
    private last_played_note_index: number = -1;
    private played_notes: Set<number> = new Set();
    private track_pointers: number[] = [];

    async initialize(): Promise<boolean> {
        if (this.is_initialized) {
            return true;
        }

        try {
            this.audio_context = new AudioContext();
            const sample_files = this.get_sample_list();
            this.sample_names = sample_files;
            await this.preload_samples();
            this.is_initialized = true;

            log_message(`AudioManager initialized with ${this.sample_names.length} samples`);
            return true;
        } catch (error) {
            log_error('Failed to initialize AudioManager:', error);
            return false;
        }
    }

    private get_sample_list(): string[] {
        const samples: string[] = [
            '#A-1.mp3',
            '#A-2.mp3',
            '#A-3.mp3',
            '#a.mp3',
            '#a1.mp3',
            '#a2.mp3',
            '#a3.mp3',
            '#a4.mp3',
            '#C-1.mp3',
            '#C-2.mp3',
            '#c.mp3',
            '#c1.mp3',
            '#c2.mp3',
            '#c3.mp3',
            '#c4.mp3',
            '#D-1.mp3',
            '#D-2.mp3',
            '#d.mp3',
            '#d1.mp3',
            '#d2.mp3',
            '#d3.mp3',
            '#d4.mp3',
            '#F-1.mp3',
            '#F-2.mp3',
            '#f.mp3',
            '#f1.mp3',
            '#f2.mp3',
            '#f3.mp3',
            '#f4.mp3',
            '#G-1.mp3',
            '#G-2.mp3',
            '#g.mp3',
            '#g1.mp3',
            '#g2.mp3',
            '#g3.mp3',
            '#g4.mp3',
            'A-1.mp3',
            'A-2.mp3',
            'A-3.mp3',
            'a.mp3',
            'a1.mp3',
            'a2.mp3',
            'a3.mp3',
            'a4.mp3',
            'B-1.mp3',
            'B-2.mp3',
            'B-3.mp3',
            'b.mp3',
            'b1.mp3',
            'b2.mp3',
            'b3.mp3',
            'b4.mp3',
            'C-1.mp3',
            'C-2.mp3',
            'c.mp3',
            'c1.mp3',
            'c2.mp3',
            'c3.mp3',
            'c4.mp3',
            'c5.mp3',
            'chuanshao.mp3',
            'D-1.mp3',
            'D-2.mp3',
            'd.mp3',
            'd1.mp3',
            'd2.mp3',
            'd3.mp3',
            'd4.mp3',
            'E-1.mp3',
            'E-2.mp3',
            'e.mp3',
            'e1.mp3',
            'e2.mp3',
            'e3.mp3',
            'e4.mp3',
            'empty.mp3',
            'F-1.mp3',
            'F-2.mp3',
            'f.mp3',
            'f1.mp3',
            'f2.mp3',
            'f3.mp3',
            'f4.mp3',
            'G-1.mp3',
            'G-2.mp3',
            'g.mp3',
            'g1.mp3',
            'g2.mp3',
            'g3.mp3',
            'g4.mp3',
            'mute.mp3',
        ];

        return samples;
    }

    private async preload_samples(): Promise<void> {
        if (!this.audio_context) {
            throw new Error('AudioContext not initialized');
        }

        const load_promises: Promise<void>[] = [];

        for (const sample_name of this.sample_names) {
            const promise = this.load_sample(sample_name);
            load_promises.push(promise);
        }

        await Promise.all(load_promises);
    }

    private async load_sample(sample_name: string): Promise<void> {
        if (!this.audio_context) {
            return;
        }

        try {
            const encoded_name = encodeURIComponent(sample_name);
            const response = await fetch(AUDIO_SAMPLES_PATH + encoded_name);

            if (!response.ok) {
                log_warning(`Failed to load sample: ${sample_name}`);
                return;
            }

            const array_buffer = await response.arrayBuffer();
            const audio_buffer = await this.audio_context.decodeAudioData(array_buffer);
            this.audio_buffers.set(sample_name, audio_buffer);
        } catch (error) {
            log_warning(`Error loading sample ${sample_name}:`, error);
        }
    }

    load_midi_data(midi_data: MidiJson): void {
        this.midi_data = midi_data;
        this.reset_playback();
        log_message(`[AudioManager] MIDI data loaded:`);
        log_message(`  - Number of tracks: ${midi_data.tracks.length}`);
        log_message(`  - PPQ: ${midi_data.header.ppq}`);
        log_message(`  - Number of tempo changes: ${midi_data.header.tempos.length}`);

        let total_notes = 0;
        for (let i = 0; i < midi_data.tracks.length; i++) {
            const track = midi_data.tracks[i];
            if (track) {
                const note_count = track.notes.length;
                total_notes += note_count;
                log_message(`  - Track ${i}: ${note_count} notes`);
            }
        }
        log_message(`  - Total notes: ${total_notes}`);

        for (const tempo of midi_data.header.tempos) {
            log_message(`  - Tempo at ticks ${tempo.ticks}: ${tempo.bpm.toFixed(2)} BPM`);
        }
    }

    clear_midi_data(): void {
        log_message(`[AudioManager] Clearing MIDI data (previously had ${this.midi_data?.tracks.length ?? 0} tracks)`);
        this.midi_data = null;
        this.reset_playback();
    }

    reset_playback(): void {
        const previous_index = this.last_played_note_index;
        const previous_count = this.played_notes.size;
        this.last_played_note_index = -1;
        this.track_pointers = new Array(this.midi_data?.tracks.length ?? 0).fill(0);
        this.played_notes.clear();
        log_message(
            `[AudioManager] Playback reset - cleared ${previous_count} played notes (was at index ${previous_index})`,
        );
    }

    update_midi_playback(current_time: number, skipped_note_ids: number[] = []): number[] {
        if (!this.midi_data || !this.is_initialized || !this.audio_context) {
            return [];
        }

        if (this.audio_context.state === 'suspended') {
            this.audio_context.resume();
        }

        let notes_played_this_update = 0;
        let notes_skipped_this_update = 0;
        const played_note_ids: number[] = [];

        for (let track_idx = 0; track_idx < this.midi_data.tracks.length; track_idx++) {
            const track = this.midi_data.tracks[track_idx];
            if (!track) continue;

            let pointer = this.track_pointers[track_idx] || 0;

            while (pointer < track.notes.length) {
                const note = track.notes[pointer];
                if (!note) {
                    pointer++;
                    continue;
                }

                if (note.time > current_time) {
                    break;
                }

                const lookback_window = 2.0;

                if (note.time > current_time - lookback_window) {
                    const note_id = Math.round(note.time * 1000) * 1000000 + track_idx * 1000 + note.midi;

                    if (!this.played_notes.has(note_id)) {
                        const is_skipped = skipped_note_ids.includes(note_id);

                        if (!is_skipped) {
                            if (note.midi >= 21 && note.midi <= 108) {
                                this.play_note_by_midi(note.midi);
                                notes_played_this_update++;
                            }
                        } else {
                            notes_skipped_this_update++;
                            log_message(
                                `[AudioManager] Skipping note (early release): MIDI ${note.midi} at time ${note.time.toFixed(3)}s`,
                            );
                        }

                        this.played_notes.add(note_id);
                        played_note_ids.push(note_id);
                    }
                }

                pointer++;
            }

            this.track_pointers[track_idx] = pointer;
        }

        if (notes_played_this_update > 0 || notes_skipped_this_update > 0) {
            log_message(
                `[AudioManager] Update at ${current_time.toFixed(3)}s: played ${notes_played_this_update}, skipped ${notes_skipped_this_update} notes, total played ${this.played_notes.size}`,
            );
        }

        const max_note_time = current_time - 10;
        let cleaned_count = 0;
        for (const note_id of this.played_notes) {
            const note_time = Math.floor(note_id / 1000000) / 1000;
            if (note_time < max_note_time) {
                this.played_notes.delete(note_id);
                cleaned_count++;
            }
        }
        if (cleaned_count > 0) {
            log_message(`[AudioManager] Cleaned up ${cleaned_count} old notes from cache`);
        }

        return played_note_ids;
    }

    add_dynamic_midi_note(track_idx: number, midi: number, time: number): void {
        if (!this.midi_data) return;
        const track = this.midi_data.tracks[track_idx];
        if (!track) return;

        track.notes.push({
            name: '',
            midi,
            time,
            velocity: 1,
            duration: 0.5,
            ticks: 0,
            duration_ticks: 0,
            note_off_velocity: 0,
        });
    }

    play_note_by_midi(midi_number: number): void {
        if (!this.is_initialized || !this.audio_context) {
            log_warning(`[AudioManager] Cannot play MIDI ${midi_number}: audio not initialized`);
            return;
        }

        if (this.audio_context.state === 'suspended') {
            this.audio_context.resume();
        }

        const note_name = MIDI_TO_NOTE[midi_number];
        if (!note_name) {
            log_warning(`[AudioManager] No note name mapping for MIDI ${midi_number}`);
            return;
        }

        const file_name = note_name + '.mp3';
        log_message(
            `[AudioManager] play_note_by_midi: MIDI ${midi_number} -> note "${note_name}" -> file "${file_name}"`,
        );
        this.play_sample(file_name);
    }

    play_random_sample(): void {
        if (this.midi_data) {
            return;
        }

        if (!this.is_initialized || !this.audio_context || this.sample_names.length === 0) {
            return;
        }

        if (this.audio_context.state === 'suspended') {
            this.audio_context.resume();
        }

        const random_index = Math.floor(Math.random() * this.sample_names.length);
        const sample_name = this.sample_names[random_index];

        if (sample_name) {
            this.play_sample(sample_name);
        }
    }

    private play_sample(sample_name: string): void {
        if (!this.audio_context) {
            return;
        }

        const buffer = this.audio_buffers.get(sample_name);
        if (!buffer) {
            log_warning(`Sample not found: ${sample_name}`);
            return;
        }

        try {
            const source = this.audio_context.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audio_context.destination);

            this.active_sources.add(source);
            source.onended = () => {
                this.active_sources.delete(source);
            };

            source.start(0);
        } catch (error) {
            log_warning(`Error playing sample ${sample_name}:`, error);
        }
    }

    play_game_over_chord(): void {
        if (!this.is_initialized || !this.audio_context) {
            return;
        }

        if (this.audio_context.state === 'suspended') {
            this.audio_context.resume();
        }

        for (const note of GAME_OVER_NOTES) {
            this.play_sample(note);
        }
    }

    stop_all_samples(): void {
        for (const source of this.active_sources) {
            try {
                source.stop();
            } catch {}
        }
        this.active_sources.clear();
    }

    get_is_initialized(): boolean {
        return this.is_initialized;
    }

    get_loaded_sample_count(): number {
        return this.audio_buffers.size;
    }

    resume_context(): void {
        if (this.audio_context && this.audio_context.state === 'suspended') {
            this.audio_context.resume();
        }
    }

    has_midi_data(): boolean {
        return this.midi_data !== null;
    }
}

let audio_manager_instance: AudioManager | null = null;

export function get_audio_manager(): AudioManager {
    if (!audio_manager_instance) {
        audio_manager_instance = new AudioManager();
    }
    return audio_manager_instance;
}
