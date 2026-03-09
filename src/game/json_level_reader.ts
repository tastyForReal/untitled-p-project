import {
    ParsedMessage,
    ParsedTrack,
    ParsedPart,
    MidiJson,
    MidiTrack,
    MidiTempo,
    NOTE_TO_MIDI,
    BASE_BEATS_MAP,
} from './midi_types.js';
import { RowType, MusicMetadata, LevelData } from './types.js';
import type { RowTypeResult } from './types.js';

export function get_note_number(note_name: string): number {
    if (note_name in NOTE_TO_MIDI) {
        return NOTE_TO_MIDI[note_name] ?? 0;
    }
    return 0;
}

export function get_base_beats_multiplier(base_beats_str: string): number {
    const key = String(base_beats_str);
    const value = BASE_BEATS_MAP[key];
    if (value !== undefined) {
        return value;
    }
    throw new Error(`Unknown base_beats value: ${base_beats_str}`);
}

export function get_length(str: string, base_beats: number): number {
    let delay = 0;
    for (const char of str) {
        switch (char) {
            case 'H':
                delay += 256 * base_beats;
                break;
            case 'I':
                delay += 128 * base_beats;
                break;
            case 'J':
                delay += 64 * base_beats;
                break;
            case 'K':
                delay += 32 * base_beats;
                break;
            case 'L':
                delay += 16 * base_beats;
                break;
            case 'M':
                delay += 8 * base_beats;
                break;
            case 'N':
                delay += 4 * base_beats;
                break;
            case 'O':
                delay += 2 * base_beats;
                break;
            case 'P':
                delay += 1 * base_beats;
                break;
            default:
                return 0;
        }
        if (delay > 0xffffff) {
            throw new Error('Length overflow');
        }
    }
    return delay;
}

export function get_rest(str: string, base_beats: number): number {
    let delay = 0;
    for (const char of str) {
        switch (char) {
            case 'Q':
                delay += 256 * base_beats;
                break;
            case 'R':
                delay += 128 * base_beats;
                break;
            case 'S':
                delay += 64 * base_beats;
                break;
            case 'T':
                delay += 32 * base_beats;
                break;
            case 'U':
                delay += 16 * base_beats;
                break;
            case 'V':
                delay += 8 * base_beats;
                break;
            case 'W':
                delay += 4 * base_beats;
                break;
            case 'X':
                delay += 2 * base_beats;
                break;
            case 'Y':
                delay += 1 * base_beats;
                break;
            default:
                return 0;
        }
        if (delay > 0xffffff) {
            throw new Error('Length overflow');
        }
    }
    return delay;
}

export class SafeDivider {
    private remainder: number = 0;

    divide(a: number, b: number): number {
        if (b === 0) {
            throw new Error('Division by zero');
        }
        const c = Math.floor(a / b);
        this.remainder += a - c * b;
        if (this.remainder >= b) {
            this.remainder = this.remainder - b;
            return c + 1;
        }
        return c;
    }

    reset(): void {
        this.remainder = 0;
    }
}

export function parse_track(score: string, bpm: number, base_beats: number): ParsedTrack {
    const messages: ParsedMessage[] = [];
    let mode = 0;
    let notes: number[] = [];

    for (let i = 0; i < score.length; i++) {
        const char = score[i];

        if (char === undefined) continue;

        if (char === '.') {
            if (mode === 2) {
                mode = 1;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
        } else if (char === '~' || char === '$') {
            if (mode === 2) {
                mode = 1;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
            notes.push(2);
        } else if (char === '@') {
            if (mode === 2) {
                mode = 1;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
            notes.push(3);
        } else if (char === '%') {
            if (mode === 2) {
                mode = 1;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
            notes.push(4);
        } else if (char === '!') {
            if (mode === 2) {
                mode = 1;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
            notes.push(5);
        } else if (char === '^' || char === '&') {
            if (mode === 2) {
                mode = 1;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
            notes.push(6);
        } else if (char === '(') {
            if (mode === 0) {
                mode = 1;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
        } else if (char === ')') {
            if (mode === 2) {
                mode = 3;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
        } else if (char === '[') {
            if (mode === 3) {
                mode = 4;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
        } else if (char === ']') {
            if (mode === 6) {
                mode = 5;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
        } else if (char === ',' || char === ';') {
            if (mode === 5) {
                mode = 0;
            } else if (mode === 0) {
            } else {
                throw new Error(`Unexpected ${char}`);
            }
        } else {
            if (char === ' ') {
                continue;
            }

            if ((char === '<' || (char >= '0' && char <= '9')) && mode === 0) {
                continue;
            }
            const look_ahead_char = score[i];
            if (
                look_ahead_char !== undefined &&
                (look_ahead_char === '>' ||
                    look_ahead_char === '{' ||
                    look_ahead_char === '}' ||
                    (look_ahead_char >= '0' && look_ahead_char <= '9')) &&
                mode === 5
            ) {
                continue;
            }

            let temp = '';
            while (true) {
                const current_char = score[i];
                if (current_char === undefined) break;
                temp += current_char;
                i++;
                const look_ahead = score[i];
                if (
                    i === score.length ||
                    look_ahead === '.' ||
                    look_ahead === '(' ||
                    look_ahead === ')' ||
                    look_ahead === '~' ||
                    look_ahead === '[' ||
                    look_ahead === ']' ||
                    look_ahead === ',' ||
                    look_ahead === ';' ||
                    look_ahead === '<' ||
                    look_ahead === '>' ||
                    look_ahead === '@' ||
                    look_ahead === '%' ||
                    look_ahead === '!' ||
                    look_ahead === '$' ||
                    look_ahead === '^' ||
                    look_ahead === '&'
                ) {
                    i--;
                    break;
                }
            }

            const note = get_note_number(temp);
            const length = get_length(temp, base_beats);
            const rest = get_rest(temp, base_beats);

            if (note !== 0) {
                if (mode === 0) {
                    mode = 3;
                } else if (mode === 1) {
                    mode = 2;
                } else {
                    throw new Error(`Unexpected token: ${temp}`);
                }
                if (note !== 1) {
                    notes.push(note);
                }
            } else if (length !== 0) {
                if (mode !== 4) {
                    throw new Error(`Unexpected token: ${temp}`);
                }
                mode = 6;

                process_notes(notes, length, messages, bpm);
                notes = [];
            } else if (rest !== 0) {
                if (mode === 0) {
                    mode = 5;
                    messages.push({ type: 2, value: rest });
                } else if (mode === 1) {
                    mode = 2;
                } else {
                    throw new Error(`Unexpected token: ${temp}`);
                }
            } else {
                throw new Error(`Couldn't parse "${temp}"`);
            }
        }
    }

    if (mode !== 0 && mode !== 5) {
        throw new Error('Incomplete score string');
    }

    return {
        base_beats,
        messages,
    };
}

function process_notes(notes: number[], length: number, messages: ParsedMessage[], bpm: number): void {
    const sdiv = new SafeDivider();

    const div = notes.filter(n => n === 2).length;
    const arp1 = notes.filter(n => n === 3).length;
    const arp2 = notes.filter(n => n === 4).length;
    const arp3 = notes.filter(n => n === 5).length;
    const arp4 = notes.filter(n => n === 6).length;

    const operator_count = Number(div > 0) + Number(arp1 > 0) + Number(arp2 > 0) + Number(arp3 > 0) + Number(arp4 > 0);
    if (operator_count > 1 || arp4 > 1) {
        throw new Error('Problem with operators');
    }

    const divisor = div + 1;

    if (arp1 > 0) {
        for (let idx = 0; idx <= notes.length; idx++) {
            if (idx === notes.length) {
                messages.push({ type: 2, value: length });
                for (const n of notes) {
                    if (n !== 3) {
                        messages.push({ type: 1, value: n });
                    }
                }
            } else {
                const note_val = notes[idx];
                if (note_val === undefined) continue;
                if (note_val === 3) {
                    let delay: number;
                    if (arp1 === 1) {
                        delay = sdiv.divide(length, 10);
                    } else {
                        delay = sdiv.divide(length, 10 * (arp1 - 1));
                    }
                    if (delay > length) {
                        throw new Error('Fatal error with @');
                    }
                    length = length - delay;
                    messages.push({ type: 2, value: delay });
                } else {
                    messages.push({ type: 0, value: note_val });
                }
            }
        }
    } else if (arp2 > 0) {
        for (let idx = 0; idx <= notes.length; idx++) {
            if (idx === notes.length) {
                messages.push({ type: 2, value: length });
                for (const n of notes) {
                    if (n !== 4) {
                        messages.push({ type: 1, value: n });
                    }
                }
            } else {
                const note_val = notes[idx];
                if (note_val === undefined) continue;
                if (note_val === 4) {
                    const delay = sdiv.divide(3 * length, 10 * arp2);
                    if (delay > length) {
                        throw new Error('Fatal error with %');
                    }
                    length = length - delay;
                    messages.push({ type: 2, value: delay });
                } else {
                    messages.push({ type: 0, value: note_val });
                }
            }
        }
    } else if (arp3 > 0) {
        for (let idx = 0; idx <= notes.length; idx++) {
            if (idx === notes.length) {
                messages.push({ type: 2, value: length });
                for (const n of notes) {
                    if (n !== 5) {
                        messages.push({ type: 1, value: n });
                    }
                }
            } else {
                const note_val = notes[idx];
                if (note_val === undefined) continue;
                if (note_val === 5) {
                    const delay = sdiv.divide(3 * length, 20 * arp3);
                    if (delay > length) {
                        throw new Error('Fatal error with !');
                    }
                    length = length - delay;
                    messages.push({ type: 2, value: delay });
                } else {
                    messages.push({ type: 0, value: note_val });
                }
            }
        }
    } else if (arp4 > 0) {
        const note0 = notes[0];
        const note1 = notes[1];
        const note2 = notes[2];
        if (
            notes.length !== 3 ||
            note1 !== 6 ||
            note0 === undefined ||
            note0 < 20 ||
            note2 === undefined ||
            note2 < 20
        ) {
            throw new Error('Problem with ornament');
        }

        let note_flip = 0;
        const bpm32 = bpm * 32;

        while (true) {
            const current_note = notes[note_flip];
            if (current_note !== undefined) {
                messages.push({ type: 0, value: current_note });
            }

            let delay = sdiv.divide(bpm32, 720);
            if (delay >= length) {
                messages.push({ type: 2, value: length });
                const end_note = notes[note_flip];
                if (end_note !== undefined) {
                    messages.push({ type: 1, value: end_note });
                }
                break;
            } else {
                length = length - delay;
                messages.push({ type: 2, value: delay });
                const mid_note = notes[note_flip];
                if (mid_note !== undefined) {
                    messages.push({ type: 1, value: mid_note });
                }
            }

            if (note_flip === 0) {
                note_flip = 2;
            } else if (note_flip === 2) {
                note_flip = 0;
            }
        }
    } else {
        const temp_notes: number[] = [];

        for (let idx = 0; idx <= notes.length; idx++) {
            const note_val = notes[idx];
            if (idx === notes.length || note_val === 2) {
                for (const tn of temp_notes) {
                    messages.push({ type: 0, value: tn });
                }
                messages.push({ type: 2, value: sdiv.divide(length, divisor) });
                for (const tn of temp_notes) {
                    messages.push({ type: 1, value: tn });
                }
                temp_notes.length = 0;
            } else if (note_val !== undefined) {
                temp_notes.push(note_val);
            }
        }
    }
}

export function calculate_track_length_diff(messages1: ParsedMessage[], messages2: ParsedMessage[]): number {
    let diff = 0;
    const msg1 = [...messages1];
    const msg2 = [...messages2];
    let a = 0;
    let b = 0;

    while (a < msg1.length || b < msg2.length) {
        while (a < msg1.length) {
            const msg = msg1[a];
            if (msg && msg.value !== 0 && msg.type === 2) {
                msg1[a] = { type: 2, value: msg.value - 1 };
                diff++;
                break;
            } else {
                a++;
            }
        }
        while (b < msg2.length) {
            const msg = msg2[b];
            if (msg && msg.value !== 0 && msg.type === 2) {
                msg2[b] = { type: 2, value: msg.value - 1 };
                diff--;
                break;
            } else {
                b++;
            }
        }
        if (diff > 0xfffffff || diff < -0xfffffff) {
            throw new Error('Length overflow');
        }
    }

    return diff;
}

export function shrink_track(messages: ParsedMessage[], amount: number): void {
    let remaining = amount;

    for (let i = messages.length; i > 0 && remaining > 0; i--) {
        const msg = messages[i - 1];
        if (msg && msg.type === 2) {
            const diff = remaining - msg.value;
            if (diff >= 0) {
                remaining = diff;
                messages[i - 1] = { type: 2, value: 0 };
            } else {
                remaining = 0;
                messages[i - 1] = { type: 2, value: -diff };
            }
        }
    }

    if (remaining !== 0) {
        throw new Error('Unable to shrink track - this should not happen');
    }

    const note_on_stack: number[] = [];
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (!msg) continue;
        if (msg.type === 2 && msg.value > 0) {
            note_on_stack.length = 0;
        } else if (msg.type === 0) {
            note_on_stack.push(i);
        } else if (msg.type === 1) {
            for (const note_on_idx of note_on_stack) {
                const onMsg = messages[note_on_idx];
                if (onMsg && onMsg.type === 0 && onMsg.value === msg.value) {
                    messages[i] = { type: 3, value: 0 };
                    messages[note_on_idx] = { type: 3, value: 0 };
                    break;
                }
            }
        }
    }
}

export function verify_track_length(tracks: ParsedTrack[]): void {
    if (tracks.length === 0) {
        throw new Error('No tracks');
    }

    for (let i = 1; i < tracks.length; i++) {
        const track0 = tracks[0];
        const trackI = tracks[i];
        if (!track0 || !trackI) continue;

        const diff = calculate_track_length_diff(track0.messages, trackI.messages);

        if (diff < 0) {
            shrink_track(trackI.messages, -diff);
        } else if (diff > 0) {
            trackI.messages.push({ type: 2, value: diff });
        }
    }
}

export function parse_song(
    musics: Array<{ bpm?: string | number; baseBeats: string | number; scores: string[] }>,
    baseBpm?: number,
): ParsedPart[] {
    const parts: ParsedPart[] = [];

    for (let p = 0; p < musics.length; p++) {
        try {
            const music = musics[p];
            if (!music) continue;
            const base_beats_multiplier = get_base_beats_multiplier(String(music.baseBeats));

            const music_bpm = music.bpm !== undefined ? Number(music.bpm) : (baseBpm ?? 120);
            const calculated_bpm = music_bpm * base_beats_multiplier;

            console.log(
                `[MidiParser] Parsing part ${p}: BPM input=${music.bpm ?? 'undefined (using baseBpm: ' + (baseBpm ?? 120) + ')'}, baseBeats=${music.baseBeats}`,
            );
            console.log(`  - base_beats_multiplier: ${base_beats_multiplier}`);
            console.log(`  - music_bpm: ${music_bpm}`);
            console.log(`  - calculated_bpm (effective): ${calculated_bpm.toFixed(2)}`);

            if (isNaN(calculated_bpm) || calculated_bpm <= 0) {
                console.warn(`[MidiParser] Invalid BPM detected: ${calculated_bpm}, using default 120`);
            }

            const part: ParsedPart = {
                bpm: isNaN(calculated_bpm) || calculated_bpm <= 0 ? 120 * base_beats_multiplier : calculated_bpm,
                base_beats: base_beats_multiplier,
                tracks: [],
            };

            for (let t = 0; t < music.scores.length; t++) {
                try {
                    const score = music.scores[t];
                    if (!score) continue;
                    console.log(`  - Parsing track ${t}: score length = ${score.length} chars`);
                    const track = parse_track(score, part.bpm, base_beats_multiplier);
                    console.log(`    - Track parsed: ${track.messages.length} messages`);
                    part.tracks.push(track);
                } catch (e) {
                    const error = e as Error;
                    console.error(`[MidiParser] Error parsing track ${t + 1}:`);
                    console.error(error);
                    throw new Error(`Track ${t + 1}:\n${error.message}`);
                }
            }

            verify_track_length(part.tracks);
            console.log(`  - Part ${p} complete: ${part.tracks.length} tracks verified`);
            parts.push(part);
        } catch (e) {
            const error = e as Error;
            console.error(`[MidiParser] Error parsing part ${p + 1}:`);
            console.error(error);
            throw new Error(`Part ${p + 1}:\n${error.message}`);
        }
    }

    return parts;
}

function align_tracks_across_parts(parts: ParsedPart[]): ParsedPart[] {
    let max_tracks = 0;
    for (const part of parts) {
        if (part.tracks.length > max_tracks) {
            max_tracks = part.tracks.length;
        }
    }

    for (const part of parts) {
        while (part.tracks.length < max_tracks) {
            const last_track = part.tracks[part.tracks.length - 1];
            if (!last_track) break;
            const new_track: ParsedTrack = {
                base_beats: last_track.base_beats,
                messages: last_track.messages.map(msg => {
                    if (msg.type < 2) {
                        return { type: 3, value: msg.value };
                    }
                    return { ...msg };
                }),
            };
            part.tracks.push(new_track);
        }
    }

    return parts;
}

function calculate_part_duration(tracks: ParsedTrack[]): number {
    let duration = 0;

    for (const track of tracks) {
        let track_duration = 0;
        for (const msg of track.messages) {
            if (msg.type === 2) {
                track_duration += msg.value;
            }
        }
        if (track_duration > duration) {
            duration = track_duration;
        }
    }

    return duration;
}

export function convert_to_midi_json(parts: ParsedPart[]): MidiJson {
    console.log(`[MidiParser] convert_to_midi_json: Processing ${parts.length} parts`);

    const aligned_parts = align_tracks_across_parts(parts);
    console.log(`[MidiParser] Tracks aligned across parts`);

    const ppq = 960;
    const tempos: MidiTempo[] = [];
    const tracks: MidiTrack[] = [];

    console.log(`[MidiParser] Using PPQ: ${ppq}`);

    const tick_scale = 1;

    let current_ticks = 0;

    for (let part_idx = 0; part_idx < aligned_parts.length; part_idx++) {
        const part = aligned_parts[part_idx];
        if (!part) continue;

        const actual_bpm = part.bpm / 30;
        console.log(`[MidiParser] Processing part ${part_idx}:`);
        console.log(`  - Effective BPM: ${part.bpm.toFixed(2)}`);
        console.log(`  - Actual BPM: ${actual_bpm.toFixed(2)}`);
        console.log(`  - Current ticks: ${current_ticks}`);
        console.log(`  - Tracks in part: ${part.tracks.length}`);

        tempos.push({
            ticks: Math.round(current_ticks * tick_scale),
            bpm: actual_bpm,
        });

        for (let track_idx = 0; track_idx < part.tracks.length; track_idx++) {
            const track = part.tracks[track_idx];
            if (!track) continue;

            let output_track = tracks[track_idx];
            if (!output_track) {
                output_track = {
                    channel: track_idx % 16,
                    notes: [],
                };
                tracks[track_idx] = output_track;
            }

            const notes_before = output_track.notes.length;
            process_track_messages(track.messages, output_track, current_ticks, tick_scale);
            console.log(`    - Track ${track_idx}: added ${output_track.notes.length - notes_before} notes`);
        }

        const part_duration = calculate_part_duration(part.tracks);
        console.log(`  - Part duration: ${part_duration} ticks`);
        current_ticks += part_duration;
    }

    console.log(`[MidiParser] Total ticks: ${current_ticks}`);
    console.log(`[MidiParser] Calculating times for ${tracks.length} tracks...`);

    calculate_times(tracks, tempos, ppq);

    calculate_tempo_times(tempos, ppq);

    let total_notes = 0;
    for (const track of tracks) {
        if (track) {
            total_notes += track.notes.length;
        }
    }
    console.log(
        `[MidiParser] Final result: ${tracks.length} tracks, ${total_notes} total notes, ${tempos.length} tempo changes`,
    );

    return {
        header: {
            ppq,
            tempos,
        },
        tracks,
    };
}

function process_track_messages(
    messages: ParsedMessage[],
    output_track: MidiTrack,
    start_ticks: number,
    tick_scale: number,
): void {
    let current_ticks = start_ticks;
    const active_notes: Map<number, number> = new Map();

    for (const msg of messages) {
        switch (msg.type) {
            case 0:
                active_notes.set(msg.value, current_ticks);
                break;

            case 1:
                {
                    const note_start = active_notes.get(msg.value);
                    if (note_start !== undefined) {
                        output_track.notes.push({
                            midi: msg.value,
                            ticks: Math.round(note_start * tick_scale),
                            time: 0,
                            duration: 0,
                            duration_ticks: Math.round((current_ticks - note_start) * tick_scale),
                            velocity: 100 / 127,
                            note_off_velocity: 64 / 127,
                        });
                        active_notes.delete(msg.value);
                    }
                }
                break;

            case 2:
                current_ticks += msg.value;
                break;

            case 3:
                break;
        }
    }
}

function calculate_times(tracks: MidiTrack[], tempos: MidiTempo[], ppq: number): void {
    tempos.sort((a, b) => a.ticks - b.ticks);

    for (const track of tracks) {
        if (!track) continue;
        for (const note of track.notes) {
            note.time = ticks_to_seconds(note.ticks, tempos, ppq);
            note.duration = ticks_to_seconds(note.ticks + note.duration_ticks, tempos, ppq) - note.time;
        }
    }
}

function calculate_tempo_times(tempos: MidiTempo[], ppq: number): void {
    for (const tempo of tempos) {
        tempo.time = ticks_to_seconds(tempo.ticks, tempos, ppq);
    }
}

function ticks_to_seconds(ticks: number, tempos: MidiTempo[], ppq: number): number {
    let time = 0;
    let current_ticks = 0;
    const first_tempo = tempos[0];
    let current_bpm = first_tempo ? first_tempo.bpm : 120;

    for (let i = 0; i < tempos.length; i++) {
        const tempo = tempos[i];
        if (!tempo) continue;
        if (tempo.ticks >= ticks) {
            break;
        }

        const delta_ticks = tempo.ticks - current_ticks;
        time += (delta_ticks / ppq) * (60 / current_bpm);
        current_ticks = tempo.ticks;
        current_bpm = tempo.bpm;
    }

    const remaining_ticks = ticks - current_ticks;
    time += (remaining_ticks / ppq) * (60 / current_bpm);

    return time;
}

export function convert_raw_to_midi_json(
    musics: Array<{ bpm?: string | number; baseBeats: string | number; scores: string[] }>,
    baseBpm?: number,
): MidiJson {
    console.log(`[MidiParser] Converting ${musics.length} music parts to MIDI format...`);
    console.log(`[MidiParser] Base BPM (fallback): ${baseBpm ?? 'not provided, will use 120'}`);

    for (let i = 0; i < musics.length; i++) {
        const music = musics[i];
        if (!music) continue;
        console.log(
            `[MidiParser] Music ${i}: BPM=${music.bpm ?? 'undefined'}, baseBeats=${music.baseBeats}, scores=${music.scores.length}`,
        );
    }

    const parts = parse_song(musics, baseBpm);
    console.log(`[MidiParser] Parsed ${parts.length} parts`);

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;
        console.log(
            `[MidiParser] Part ${i}: BPM=${part.bpm.toFixed(2)}, base_beats=${part.base_beats}, tracks=${part.tracks.length}`,
        );
    }

    const result = convert_to_midi_json(parts);
    console.log(
        `[MidiParser] Conversion complete: ${result.tracks.length} tracks, ${result.header.tempos.length} tempo changes`,
    );

    return result;
}

export type { RowTypeResult, LevelData, MusicMetadata } from './types.js';

interface ParsedComponent {
    duration: number;
    original_type: RowType;
}

const DURATION_MAP: Record<string, number> = {
    H: 256,
    I: 128,
    J: 64,
    K: 32,
    L: 16,
    M: 8,
    N: 4,
    O: 2,
    P: 1,
};

const REST_MAP: Record<string, number> = {
    Q: 256,
    R: 128,
    S: 64,
    T: 32,
    U: 16,
    V: 8,
    W: 4,
    X: 2,
    Y: 1,
};

const COMBINED_MAP: Record<string, number> = { ...DURATION_MAP, ...REST_MAP };

function extract_letters(str: string, map: Record<string, number>): number {
    let total = 0;
    for (const char of str) {
        const value = map[char];
        if (value !== undefined) {
            total += value;
        }
    }
    return total;
}

function extract_duration_letters(str: string): number {
    return extract_letters(str, DURATION_MAP);
}

function extract_rest_letters(str: string): number {
    return extract_letters(str, REST_MAP);
}

function extract_all_letters(str: string): number {
    return extract_letters(str, COMBINED_MAP);
}

function is_only_rest_letters(str: string): boolean {
    if (str.length === 0) return false;
    for (const char of str) {
        if (REST_MAP[char] === undefined) {
            return false;
        }
    }
    return true;
}

function calculate_height_multiplier(duration: number, divisor: number): number {
    return duration <= divisor ? 1 : duration / divisor;
}

function parse_component(component: string): ParsedComponent {
    const trimmed = component.trim();

    const group_match = trimmed.match(/^(\d)<(.+)>$/);
    if (group_match) {
        const type_id = parseInt(group_match[1] ?? '0', 10);
        const group_content = group_match[2] ?? '';

        const duration = extract_all_letters(group_content);
        const original_type = type_id === 5 ? RowType.DOUBLE : RowType.SINGLE;
        return { duration, original_type };
    }

    if (is_only_rest_letters(trimmed)) {
        const duration = extract_rest_letters(trimmed);
        return { duration, original_type: RowType.EMPTY };
    }

    const duration = extract_duration_letters(trimmed);
    return { duration, original_type: RowType.SINGLE };
}

function split_score(score: string): string[] {
    const components: string[] = [];
    let current = '';
    let i = 0;

    while (i < score.length) {
        const char = score[i];

        if (char === undefined) {
            i++;
            continue;
        }

        if (char === '<') {
            if (current.length > 0 && /\d$/.test(current)) {
                const digit = current.slice(-1) ?? '';
                current = current.slice(0, -1);

                if (current.trim()) {
                    components.push(current.trim());
                    current = '';
                }

                let depth = 0;
                let group_str = digit;
                while (i < score.length) {
                    const c = score[i];
                    if (c === undefined) break;
                    if (c === '<') depth++;
                    else if (c === '>') depth--;
                    group_str += c;
                    i++;
                    if (depth === 0) break;
                }
                components.push(group_str);
                const next_char = score[i];
                if (next_char === ',') i++;
            } else {
                current += char;
                i++;
            }
        } else if (char === ',' || char === ';') {
            if (current.trim()) {
                components.push(current.trim());
                current = '';
            }
            i++;
        } else {
            current += char;
            i++;
        }
    }

    if (current.trim()) {
        components.push(current.trim());
    }

    return components;
}

export function parse_score(score: string): ParsedComponent[] {
    const component_strings = split_score(score);
    return component_strings.map(parse_component);
}

interface TimelineEntry {
    start: number;
    end: number;
    index: number;
    is_rest: boolean;
}

function build_timeline(components: ParsedComponent[]): TimelineEntry[] {
    const timeline: TimelineEntry[] = [];
    let current_time = 0;

    for (let i = 0; i < components.length; i++) {
        const comp = components[i];
        if (!comp) continue;
        timeline.push({
            start: current_time,
            end: current_time + comp.duration,
            index: i,
            is_rest: comp.original_type === RowType.EMPTY,
        });
        current_time += comp.duration;
    }

    return timeline;
}

function find_primary_entry_by_start(primary_timeline: TimelineEntry[], secondary_start: number): number {
    let left = 0;
    let right = primary_timeline.length - 1;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const entry = primary_timeline[mid];
        if (!entry) return -1;

        if (entry.start <= secondary_start && secondary_start < entry.end) {
            return mid;
        }

        if (secondary_start < entry.start) {
            right = mid - 1;
        } else {
            left = mid + 1;
        }
    }

    return -1;
}

function blend_tracks(primary_timeline: TimelineEntry[], secondary_scores: string[]): Set<number> {
    const blended_indices = new Set<number>();

    for (const secondary_score of secondary_scores) {
        const secondary_components = parse_score(secondary_score);
        const secondary_timeline = build_timeline(secondary_components);

        for (const sec_entry of secondary_timeline) {
            if (!sec_entry.is_rest) {
                const primary_index = find_primary_entry_by_start(primary_timeline, sec_entry.start);

                if (primary_index !== -1) {
                    const prim_entry = primary_timeline[primary_index];
                    if (prim_entry && prim_entry.is_rest) {
                        blended_indices.add(prim_entry.index);
                    }
                }
            }
        }
    }

    return blended_indices;
}

function create_result_entry(type: RowType, duration: number, unit_divisor: number): RowTypeResult {
    return {
        type,
        height_multiplier: type === RowType.DOUBLE ? 1 : calculate_height_multiplier(duration, unit_divisor),
    };
}

function generate_results(
    components: ParsedComponent[],
    blended_indices: Set<number>,
    unit_divisor: number,
): RowTypeResult[] {
    return components.map((comp, index) => {
        if (comp.original_type === RowType.EMPTY) {
            if (blended_indices.has(index)) {
                return create_result_entry(RowType.SINGLE, comp.duration, unit_divisor);
            }
            return {
                type: RowType.EMPTY,
                height_multiplier: comp.duration / unit_divisor,
            };
        }

        return create_result_entry(comp.original_type, comp.duration, unit_divisor);
    });
}

function process_music(music: { id: number; baseBeats: number; scores: string[] }): RowTypeResult[] {
    const unit_divisor = 32 * music.baseBeats;

    if (music.scores.length === 0) return [];

    const primary_score = music.scores[0];
    if (!primary_score) return [];

    const primary_components = parse_score(primary_score);
    const primary_timeline = build_timeline(primary_components);

    const secondary_scores = music.scores.slice(1);
    const blended_indices = blend_tracks(primary_timeline, secondary_scores);

    return generate_results(primary_components, blended_indices, unit_divisor);
}

export interface MusicEntry {
    id: number;
    bpm?: number | undefined;

    baseBeats: number;
    scores: string[];
}

export interface MusicInputFile {
    baseBpm: number;
    musics: MusicEntry[];
    audition?:
        | {
              start: [number, number];
              end: [number, number];
          }
        | undefined;
}

export interface MusicOutput {
    id: number;
    rows: RowTypeResult[];
}

export interface MusicOutputFile {
    results: MusicOutput[];
}

function validate_music_input(data: unknown): MusicInputFile {
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid JSON structure: expected an object');
    }

    const input = data as Record<string, unknown>;

    const base_bpm = input['baseBpm'];
    if (typeof base_bpm !== 'number') {
        throw new Error('Invalid JSON structure: "baseBpm" must be a number and is required');
    }

    const musics = input['musics'];
    if (!musics || !Array.isArray(musics)) {
        throw new Error('Invalid JSON structure: "musics" array is required');
    }

    const entry_list: MusicEntry[] = [];
    for (const music of musics) {
        if (!music || typeof music !== 'object') {
            throw new Error('Invalid music entry: expected an object');
        }
        const m = music as Record<string, unknown>;
        if (typeof m['id'] !== 'number') {
            throw new Error('Invalid music entry: "id" must be a number');
        }
        if (typeof m['baseBeats'] !== 'number') {
            throw new Error('Invalid music entry: "baseBeats" must be a number');
        }
        if (!Array.isArray(m['scores'])) {
            throw new Error('Invalid music entry: "scores" must be an array');
        }

        entry_list.push({
            id: m['id'],
            bpm: typeof m['bpm'] === 'number' ? m['bpm'] : undefined,
            baseBeats: m['baseBeats'] as number,
            scores: m['scores'] as string[],
        });
    }

    return {
        baseBpm: base_bpm as number,
        musics: entry_list,
        audition: input['audition'] as { start: [number, number]; end: [number, number] } | undefined,
    };
}

export function parse_music_json_string(json_string: string): MusicOutput[] {
    const data = JSON.parse(json_string);
    validate_music_input(data);

    const results: MusicOutput[] = [];

    const musics = (data as MusicInputFile).musics;
    for (const music of musics) {
        results.push({
            id: music.id,
            rows: process_music({
                id: music.id,
                baseBeats: music.baseBeats,
                scores: music.scores,
            }),
        });
    }

    return results;
}

export function process_music_input_data(data: MusicInputFile): MusicOutput[] {
    const results: MusicOutput[] = [];

    for (const music of data.musics) {
        results.push({
            id: music.id,
            rows: process_music({
                id: music.id,
                baseBeats: music.baseBeats,
                scores: music.scores,
            }),
        });
    }

    return results;
}

export interface LoadedMusicFile {
    level_data: LevelData;
    filename: string;
}

export async function select_and_load_music_file(): Promise<LoadedMusicFile> {
    return new Promise((resolve, reject) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';

        input.onchange = async (event: Event) => {
            const target = event.target as HTMLInputElement;
            const file = target.files?.[0];

            if (!file) {
                reject(new Error('No file selected'));
                return;
            }

            try {
                const text = await file.text();
                const json = JSON.parse(text);
                const level_data = load_level_from_json(json);
                resolve({ level_data, filename: file.name });
            } catch (error) {
                reject(error instanceof Error ? error : new Error('Failed to load file'));
            }
        };

        input.click();
    });
}

export function load_level_from_json(json: unknown): LevelData {
    const data = validate_music_input(json);

    const all_rows: RowTypeResult[] = [];
    const musics_metadata: MusicMetadata[] = [];

    let current_row_index = 0;

    for (const music of data.musics) {
        const rows = process_music({
            id: music.id,
            baseBeats: music.baseBeats,
            scores: music.scores,
        });

        const bpm = music.bpm !== undefined ? music.bpm : data.baseBpm;
        const tps = bpm / music.baseBeats / 60;

        musics_metadata.push({
            id: music.id,
            tps,
            bpm,
            base_beats: music.baseBeats,
            start_row_index: current_row_index,
            end_row_index: current_row_index + rows.length,
            row_count: rows.length,
        });

        all_rows.push(...rows);
        current_row_index += rows.length;
    }

    const music_data = data.musics.map(m => {
        const result: { bpm?: string | number; baseBeats: string | number; scores: string[] } = {
            baseBeats: m.baseBeats,
            scores: m.scores,
        };
        if (m.bpm !== undefined) {
            result.bpm = m.bpm;
        }
        return result;
    });
    const midi_json = convert_raw_to_midi_json(music_data, data.baseBpm);

    return {
        rows: all_rows,
        musics: musics_metadata,
        base_bpm: data.baseBpm,
        midi_json,
    };
}
