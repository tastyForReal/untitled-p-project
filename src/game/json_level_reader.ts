import {
    ParsedMessage,
    ParsedTrack,
    ParsedPart,
    MidiJson,
    MidiTrack,
    MidiTempo,
    NOTE_TO_MIDI,
    BASEBEATS_MAP,
} from "./midi_types.js";
import { RowType } from "./types.js";

// =============================================================================
// MIDI Conversion Functions
// =============================================================================

/**
 * Gets the MIDI note number from a note name string.
 */
export function get_note_number(note_name: string): number {
    if (note_name in NOTE_TO_MIDI) {
        return NOTE_TO_MIDI[note_name] ?? 0;
    }
    return 0;
}

/**
 * Gets the base beats multiplier from the baseBeats string.
 */
export function get_base_beats_multiplier(base_beats_str: string): number {
    // Handle both string and number inputs
    const key = String(base_beats_str);
    const value = BASEBEATS_MAP[key];
    if (value !== undefined) {
        return value;
    }
    throw new Error(`Unknown baseBeats value: ${base_beats_str}`);
}

/**
 * Calculates the length in ticks from a length code string.
 * Length codes use letters H-P for note lengths.
 */
export function get_length(str: string, base_beats: number): number {
    let delay = 0;
    for (const char of str) {
        switch (char) {
            case "H":
                delay += 256 * base_beats;
                break;
            case "I":
                delay += 128 * base_beats;
                break;
            case "J":
                delay += 64 * base_beats;
                break;
            case "K":
                delay += 32 * base_beats;
                break;
            case "L":
                delay += 16 * base_beats;
                break;
            case "M":
                delay += 8 * base_beats;
                break;
            case "N":
                delay += 4 * base_beats;
                break;
            case "O":
                delay += 2 * base_beats;
                break;
            case "P":
                delay += 1 * base_beats;
                break;
            default:
                return 0;
        }
        if (delay > 0xffffff) {
            throw new Error("Length overflow");
        }
    }
    return delay;
}

/**
 * Calculates the rest length in ticks from a rest code string.
 * Rest codes use letters Q-Y.
 */
export function get_rest(str: string, base_beats: number): number {
    let delay = 0;
    for (const char of str) {
        switch (char) {
            case "Q":
                delay += 256 * base_beats;
                break;
            case "R":
                delay += 128 * base_beats;
                break;
            case "S":
                delay += 64 * base_beats;
                break;
            case "T":
                delay += 32 * base_beats;
                break;
            case "U":
                delay += 16 * base_beats;
                break;
            case "V":
                delay += 8 * base_beats;
                break;
            case "W":
                delay += 4 * base_beats;
                break;
            case "X":
                delay += 2 * base_beats;
                break;
            case "Y":
                delay += 1 * base_beats;
                break;
            default:
                return 0;
        }
        if (delay > 0xffffff) {
            throw new Error("Length overflow");
        }
    }
    return delay;
}

/**
 * Safe divider class that accumulates remainders for accurate division.
 */
export class SafeDivider {
    private remainder: number = 0;

    divide(a: number, b: number): number {
        if (b === 0) {
            throw new Error("Division by zero");
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

/**
 * Parses a single track score string into messages.
 */
export function parse_track(score: string, bpm: number, base_beats: number): ParsedTrack {
    const messages: ParsedMessage[] = [];
    let mode = 0;
    let notes: number[] = [];

    for (let i = 0; i < score.length; i++) {
        const char = score[i];

        if (char === undefined) continue;

        if (char === ".") {
            if (mode === 2) {
                mode = 1;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
        } else if (char === "~" || char === "$") {
            if (mode === 2) {
                mode = 1;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
            notes.push(2);
        } else if (char === "@") {
            if (mode === 2) {
                mode = 1;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
            notes.push(3);
        } else if (char === "%") {
            if (mode === 2) {
                mode = 1;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
            notes.push(4);
        } else if (char === "!") {
            if (mode === 2) {
                mode = 1;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
            notes.push(5);
        } else if (char === "^" || char === "&") {
            if (mode === 2) {
                mode = 1;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
            notes.push(6);
        } else if (char === "(") {
            if (mode === 0) {
                mode = 1;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
        } else if (char === ")") {
            if (mode === 2) {
                mode = 3;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
        } else if (char === "[") {
            if (mode === 3) {
                mode = 4;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
        } else if (char === "]") {
            if (mode === 6) {
                mode = 5;
            } else {
                throw new Error(`Unexpected ${char}`);
            }
        } else if (char === "," || char === ";") {
            if (mode === 5) {
                mode = 0;
            } else if (mode === 0) {
                // Duplicated separator - ignore
            } else {
                throw new Error(`Unexpected ${char}`);
            }
        } else {
            if (char === " ") {
                continue;
            }

            // Ignore < > and digits outside parsing contexts
            if ((char === "<" || (char >= "0" && char <= "9")) && mode === 0) {
                continue;
            }
            const lookAheadChar = score[i];
            if (
                lookAheadChar !== undefined &&
                (lookAheadChar === ">" ||
                    lookAheadChar === "{" ||
                    lookAheadChar === "}" ||
                    (lookAheadChar >= "0" && lookAheadChar <= "9")) &&
                mode === 5
            ) {
                continue;
            }

            // Parse a token (note name or length code)
            let temp = "";
            while (true) {
                const currentChar = score[i];
                if (currentChar === undefined) break;
                temp += currentChar;
                i++;
                const lookAhead = score[i];
                if (
                    i === score.length ||
                    lookAhead === "." ||
                    lookAhead === "(" ||
                    lookAhead === ")" ||
                    lookAhead === "~" ||
                    lookAhead === "[" ||
                    lookAhead === "]" ||
                    lookAhead === "," ||
                    lookAhead === ";" ||
                    lookAhead === "<" ||
                    lookAhead === ">" ||
                    lookAhead === "@" ||
                    lookAhead === "%" ||
                    lookAhead === "!" ||
                    lookAhead === "$" ||
                    lookAhead === "^" ||
                    lookAhead === "&"
                ) {
                    i--;
                    break;
                }
            }

            const note = get_note_number(temp);
            const length = get_length(temp, base_beats);
            const rest = get_rest(temp, base_beats);

            if (note !== 0) {
                // It's a note
                if (mode === 0) {
                    mode = 3;
                } else if (mode === 1) {
                    mode = 2;
                } else {
                    throw new Error(`Unexpected token: ${temp}`);
                }
                if (note !== 1) {
                    // note !== 1 means it's not mute/empty
                    notes.push(note);
                }
            } else if (length !== 0) {
                // It's a length code
                if (mode !== 4) {
                    throw new Error(`Unexpected token: ${temp}`);
                }
                mode = 6;

                // Flush notes
                process_notes(notes, length, messages, bpm);
                notes = [];
            } else if (rest !== 0) {
                // It's a rest
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
        throw new Error("Incomplete score string");
    }

    return {
        base_beats,
        messages,
    };
}

/**
 * Processes accumulated notes and generates messages.
 */
function process_notes(notes: number[], length: number, messages: ParsedMessage[], bpm: number): void {
    const sdiv = new SafeDivider();

    // Count special operators
    const div = notes.filter(n => n === 2).length; // ~
    const arp1 = notes.filter(n => n === 3).length; // @
    const arp2 = notes.filter(n => n === 4).length; // %
    const arp3 = notes.filter(n => n === 5).length; // !
    const arp4 = notes.filter(n => n === 6).length; // ^

    // Validate operator combination
    const operator_count = Number(div > 0) + Number(arp1 > 0) + Number(arp2 > 0) + Number(arp3 > 0) + Number(arp4 > 0);
    if (operator_count > 1 || arp4 > 1) {
        throw new Error("Problem with operators");
    }

    const divisor = div + 1;

    if (arp1 > 0) {
        // @ operator (arpeggio type 1)
        for (let idx = 0; idx <= notes.length; idx++) {
            if (idx === notes.length) {
                messages.push({ type: 2, value: length });
                for (const n of notes) {
                    if (n !== 3) {
                        messages.push({ type: 1, value: n });
                    }
                }
            } else {
                const noteVal = notes[idx];
                if (noteVal === undefined) continue;
                if (noteVal === 3) {
                    let delay: number;
                    if (arp1 === 1) {
                        delay = sdiv.divide(length, 10);
                    } else {
                        delay = sdiv.divide(length, 10 * (arp1 - 1));
                    }
                    if (delay > length) {
                        throw new Error("Fatal error with @");
                    }
                    length = length - delay;
                    messages.push({ type: 2, value: delay });
                } else {
                    messages.push({ type: 0, value: noteVal });
                }
            }
        }
    } else if (arp2 > 0) {
        // % operator (arpeggio type 2)
        for (let idx = 0; idx <= notes.length; idx++) {
            if (idx === notes.length) {
                messages.push({ type: 2, value: length });
                for (const n of notes) {
                    if (n !== 4) {
                        messages.push({ type: 1, value: n });
                    }
                }
            } else {
                const noteVal = notes[idx];
                if (noteVal === undefined) continue;
                if (noteVal === 4) {
                    const delay = sdiv.divide(3 * length, 10 * arp2);
                    if (delay > length) {
                        throw new Error("Fatal error with %");
                    }
                    length = length - delay;
                    messages.push({ type: 2, value: delay });
                } else {
                    messages.push({ type: 0, value: noteVal });
                }
            }
        }
    } else if (arp3 > 0) {
        // ! operator (arpeggio type 3)
        for (let idx = 0; idx <= notes.length; idx++) {
            if (idx === notes.length) {
                messages.push({ type: 2, value: length });
                for (const n of notes) {
                    if (n !== 5) {
                        messages.push({ type: 1, value: n });
                    }
                }
            } else {
                const noteVal = notes[idx];
                if (noteVal === undefined) continue;
                if (noteVal === 5) {
                    const delay = sdiv.divide(3 * length, 20 * arp3);
                    if (delay > length) {
                        throw new Error("Fatal error with !");
                    }
                    length = length - delay;
                    messages.push({ type: 2, value: delay });
                } else {
                    messages.push({ type: 0, value: noteVal });
                }
            }
        }
    } else if (arp4 > 0) {
        // ^ operator (ornament)
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
            throw new Error("Problem with ornament");
        }

        let note_flip = 0;
        const bpm32 = bpm * 32;

        while (true) {
            // Play note
            const currentNote = notes[note_flip];
            if (currentNote !== undefined) {
                messages.push({ type: 0, value: currentNote });
            }

            // Wait
            let delay = sdiv.divide(bpm32, 720);
            if (delay >= length) {
                // End
                messages.push({ type: 2, value: length });
                const endNote = notes[note_flip];
                if (endNote !== undefined) {
                    messages.push({ type: 1, value: endNote });
                }
                break;
            } else {
                length = length - delay;
                messages.push({ type: 2, value: delay });
                const midNote = notes[note_flip];
                if (midNote !== undefined) {
                    messages.push({ type: 1, value: midNote });
                }
            }

            // Flip between first and third note
            if (note_flip === 0) {
                note_flip = 2;
            } else if (note_flip === 2) {
                note_flip = 0;
            }
        }
    } else {
        // Normal case (with optional ~ dividers)
        const temp_notes: number[] = [];

        for (let idx = 0; idx <= notes.length; idx++) {
            const noteVal = notes[idx];
            if (idx === notes.length || noteVal === 2) {
                // Flush accumulated notes
                for (const tn of temp_notes) {
                    messages.push({ type: 0, value: tn });
                }
                messages.push({ type: 2, value: sdiv.divide(length, divisor) });
                for (const tn of temp_notes) {
                    messages.push({ type: 1, value: tn });
                }
                temp_notes.length = 0;
            } else if (noteVal !== undefined) {
                temp_notes.push(noteVal);
            }
        }
    }
}

/**
 * Calculates the length difference between two tracks.
 */
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
            throw new Error("Length overflow");
        }
    }

    return diff;
}

/**
 * Shrinks a track by removing a specified number of ticks.
 */
export function shrink_track(messages: ParsedMessage[], amount: number): void {
    let remaining = amount;

    // Process from end to beginning
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
        throw new Error("Unable to shrink track - this should not happen");
    }

    // Clean up orphaned notes
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

/**
 * Verifies and aligns track lengths within a part.
 */
export function verify_track_length(tracks: ParsedTrack[]): void {
    if (tracks.length === 0) {
        throw new Error("No tracks");
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

/**
 * Parses a complete song into parts.
 * @param musics Array of music parts to parse
 * @param base_bpm Fallback BPM to use when a music part doesn't have its own BPM
 */
export function parse_song(
    musics: Array<{ bpm?: string | number; baseBeats: string | number; scores: string[] }>,
    base_bpm?: number,
): ParsedPart[] {
    const parts: ParsedPart[] = [];

    for (let p = 0; p < musics.length; p++) {
        try {
            const music = musics[p];
            if (!music) continue;
            const base_beats_multiplier = get_base_beats_multiplier(String(music.baseBeats));

            // Use music.bpm if defined, otherwise fall back to base_bpm
            const music_bpm = music.bpm !== undefined ? Number(music.bpm) : (base_bpm ?? 120);
            const calculated_bpm = music_bpm * base_beats_multiplier;

            console.log(
                `[MidiParser] Parsing part ${p}: BPM input=${music.bpm ?? "undefined (using baseBpm: " + (base_bpm ?? 120) + ")"}, baseBeats=${music.baseBeats}`,
            );
            console.log(`  - base_beats_multiplier: ${base_beats_multiplier}`);
            console.log(`  - music_bpm: ${music_bpm}`);
            console.log(`  - calculated_bpm (effective): ${calculated_bpm.toFixed(2)}`);

            // Validate BPM is a valid number
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

/**
 * Aligns tracks across all parts by duplicating tracks where necessary.
 */
function align_tracks_across_parts(parts: ParsedPart[]): ParsedPart[] {
    // Find maximum number of tracks
    let max_tracks = 0;
    for (const part of parts) {
        if (part.tracks.length > max_tracks) {
            max_tracks = part.tracks.length;
        }
    }

    // Duplicate last track for parts with fewer tracks
    for (const part of parts) {
        while (part.tracks.length < max_tracks) {
            const last_track = part.tracks[part.tracks.length - 1];
            if (!last_track) break;
            const new_track: ParsedTrack = {
                base_beats: last_track.base_beats,
                messages: last_track.messages.map(msg => {
                    // Mark note on/off as ignored (type 3)
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

/**
 * Calculates the total duration of a part in ticks.
 */
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

/**
 * Converts parsed parts to formatted MIDI JSON.
 * This is the main conversion function that produces the output format.
 */
export function convert_to_midi_json(parts: ParsedPart[]): MidiJson {
    console.log(`[MidiParser] convert_to_midi_json: Processing ${parts.length} parts`);

    // Align tracks across all parts
    const aligned_parts = align_tracks_across_parts(parts);
    console.log(`[MidiParser] Tracks aligned across parts`);

    const ppq = 960; // Ticks per quarter note
    const tempos: MidiTempo[] = [];
    const tracks: MidiTrack[] = [];

    console.log(`[MidiParser] Using PPQ: ${ppq}`);

    // Calculate tick scaling factor (we use PPQ 960 internally)
    const tick_scale = 1;

    // Process each part
    let current_ticks = 0;

    for (let part_idx = 0; part_idx < aligned_parts.length; part_idx++) {
        const part = aligned_parts[part_idx];
        if (!part) continue;

        // Set tempo at the current position
        // The conversion from effective BPM to actual BPM is: actual_bpm = effective_bpm / 30
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

        // Process each track in the part
        for (let track_idx = 0; track_idx < part.tracks.length; track_idx++) {
            const track = part.tracks[track_idx];
            if (!track) continue;

            // Get or create the output track
            let output_track = tracks[track_idx];
            if (!output_track) {
                output_track = {
                    channel: track_idx % 16,
                    notes: [],
                };
                tracks[track_idx] = output_track;
            }

            // Convert messages to notes with tick scaling
            const notes_before = output_track.notes.length;
            process_track_messages(track.messages, output_track, current_ticks, tick_scale);
            console.log(`    - Track ${track_idx}: added ${output_track.notes.length - notes_before} notes`);
        }

        // Calculate part duration for track alignment
        const part_duration = calculate_part_duration(part.tracks);
        console.log(`  - Part duration: ${part_duration} ticks`);
        current_ticks += part_duration;
    }

    console.log(`[MidiParser] Total ticks: ${current_ticks}`);
    console.log(`[MidiParser] Calculating times for ${tracks.length} tracks...`);

    // Calculate times for all notes based on tempo changes
    calculate_times(tracks, tempos, ppq);

    // Add time to tempos
    calculate_tempo_times(tempos, ppq);

    // Log final statistics
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

/**
 * Processes track messages and adds notes to the output track.
 */
function process_track_messages(
    messages: ParsedMessage[],
    output_track: MidiTrack,
    start_ticks: number,
    tick_scale: number,
): void {
    let current_ticks = start_ticks;
    const active_notes: Map<number, number> = new Map(); // note number -> start ticks

    for (const msg of messages) {
        switch (msg.type) {
            case 0: // Note on
                active_notes.set(msg.value, current_ticks);
                break;

            case 1: // Note off
                {
                    const note_start = active_notes.get(msg.value);
                    if (note_start !== undefined) {
                        output_track.notes.push({
                            midi: msg.value,
                            ticks: Math.round(note_start * tick_scale),
                            time: 0, // Will be calculated later
                            duration: 0, // Will be calculated later
                            duration_ticks: Math.round((current_ticks - note_start) * tick_scale),
                            velocity: 100 / 127,
                            note_off_velocity: 64 / 127,
                        });
                        active_notes.delete(msg.value);
                    }
                }
                break;

            case 2: // Delay/time
                current_ticks += msg.value;
                break;

            case 3: // Ignore
                break;
        }
    }
}

/**
 * Calculates time values for notes based on tempo changes.
 */
function calculate_times(tracks: MidiTrack[], tempos: MidiTempo[], ppq: number): void {
    // Sort tempos by ticks
    tempos.sort((a, b) => a.ticks - b.ticks);

    for (const track of tracks) {
        if (!track) continue;
        for (const note of track.notes) {
            note.time = ticks_to_seconds(note.ticks, tempos, ppq);
            note.duration = ticks_to_seconds(note.ticks + note.duration_ticks, tempos, ppq) - note.time;
        }
    }
}

/**
 * Calculates time values for tempo events.
 */
function calculate_tempo_times(tempos: MidiTempo[], ppq: number): void {
    for (const tempo of tempos) {
        tempo.time = ticks_to_seconds(tempo.ticks, tempos, ppq);
    }
}

/**
 * Converts ticks to seconds based on tempo changes.
 */
function ticks_to_seconds(ticks: number, tempos: MidiTempo[], ppq: number): number {
    let time = 0;
    let current_ticks = 0;
    const firstTempo = tempos[0];
    let current_bpm = firstTempo ? firstTempo.bpm : 120;

    for (let i = 0; i < tempos.length; i++) {
        const tempo = tempos[i];
        if (!tempo) continue;
        if (tempo.ticks >= ticks) {
            break;
        }
        // Add time from current position to this tempo change
        const delta_ticks = tempo.ticks - current_ticks;
        time += (delta_ticks / ppq) * (60 / current_bpm);
        current_ticks = tempo.ticks;
        current_bpm = tempo.bpm;
    }

    // Add remaining time
    const remaining_ticks = ticks - current_ticks;
    time += (remaining_ticks / ppq) * (60 / current_bpm);

    return time;
}

/**
 * Main conversion function: converts raw JSON music data to formatted MIDI JSON.
 * @param musics Array of music parts to convert
 * @param base_bpm Fallback BPM to use when a music part doesn't have its own BPM
 */
export function convert_raw_to_midi_json(
    musics: Array<{ bpm?: string | number; baseBeats: string | number; scores: string[] }>,
    base_bpm?: number,
): MidiJson {
    console.log(`[MidiParser] Converting ${musics.length} music parts to MIDI format...`);
    console.log(`[MidiParser] Base BPM (fallback): ${base_bpm ?? "not provided, will use 120"}`);

    for (let i = 0; i < musics.length; i++) {
        const music = musics[i];
        if (!music) continue;
        console.log(
            `[MidiParser] Music ${i}: BPM=${music.bpm ?? "undefined"}, baseBeats=${music.baseBeats}, scores=${music.scores.length}`,
        );
    }

    const parts = parse_song(musics, base_bpm);
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

// =============================================================================
// Level Loader Types and Functions
// =============================================================================

export interface RowTypeResult {
    type: RowType;
    height_multiplier: number;
}

/**
 * Metadata for a music section within the level (internal representation)
 */
export interface MusicMetadata {
    id: number;
    tps: number; // Tiles per second
    start_row_index: number; // Index of first row in combined array
    end_row_index: number; // Index after last row (exclusive)
    row_count: number; // Number of rows in this music
}

/**
 * Complete level data including rows and music metadata
 */
export interface LevelData {
    rows: RowTypeResult[];
    musics: MusicMetadata[];
    base_bpm: number;
    midi_json: MidiJson | null; // Formatted MIDI data for playback
}

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
        const type_id = parseInt(group_match[1] ?? "0", 10);
        const group_content = group_match[2] ?? "";

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
    let current = "";
    let i = 0;

    while (i < score.length) {
        const char = score[i];

        if (char === undefined) {
            i++;
            continue;
        }

        if (char === "<") {
            if (current.length > 0 && /\d$/.test(current)) {
                const digit = current.slice(-1) ?? "";
                current = current.slice(0, -1);

                if (current.trim()) {
                    components.push(current.trim());
                    current = "";
                }

                let depth = 0;
                let group_str = digit;
                while (i < score.length) {
                    const c = score[i];
                    if (c === undefined) break;
                    if (c === "<") depth++;
                    else if (c === ">") depth--;
                    group_str += c;
                    i++;
                    if (depth === 0) break;
                }
                components.push(group_str);
                const nextChar = score[i];
                if (nextChar === ",") i++;
            } else {
                current += char;
                i++;
            }
        } else if (char === "," || char === ";") {
            if (current.trim()) {
                components.push(current.trim());
                current = "";
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

/**
 * Music entry in the JSON file (matches JSON format)
 */
export interface MusicEntry {
    id: number;
    bpm?: number;
    baseBeats: number; // JSON uses camelCase
    scores: string[];
}

/**
 * Input file format for level data (matches JSON format)
 */
export interface MusicInputFile {
    baseBpm: number; // JSON uses camelCase
    musics: MusicEntry[];
    audition?: {
        start: [number, number];
        end: [number, number];
    };
}

export interface MusicOutput {
    id: number;
    rows: RowTypeResult[];
}

export interface MusicOutputFile {
    results: MusicOutput[];
}

/**
 * Validates the structure of music input data
 */
function validate_music_input(data: unknown): MusicInputFile {
    if (!data || typeof data !== "object") {
        throw new Error("Invalid JSON structure: expected an object");
    }

    const input = data as Record<string, unknown>;

    const baseBpm = input["baseBpm"];
    if (typeof baseBpm !== "number") {
        throw new Error('Invalid JSON structure: "baseBpm" must be a number and is required');
    }

    const musics = input["musics"];
    if (!musics || !Array.isArray(musics)) {
        throw new Error('Invalid JSON structure: "musics" array is required');
    }

    for (const music of musics) {
        if (!music || typeof music !== "object") {
            throw new Error("Invalid music entry: expected an object");
        }
        const m = music as Record<string, unknown>;
        if (typeof m["id"] !== "number") {
            throw new Error('Invalid music entry: "id" must be a number');
        }
        if (typeof m["baseBeats"] !== "number") {
            throw new Error('Invalid music entry: "baseBeats" must be a number');
        }
        if (!Array.isArray(m["scores"])) {
            throw new Error('Invalid music entry: "scores" must be an array');
        }
    }

    return data as MusicInputFile;
}

/**
 * Parses a JSON string containing music data and returns individual music outputs
 */
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

/**
 * Processes music input data and returns individual music outputs
 */
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

/**
 * Calculate TPS (Tiles Per Second) for a music entry
 * TPS = bpm / baseBeats / 60
 */
function calculate_tps(music: MusicEntry, base_bpm: number): number {
    const bpm = music.bpm !== undefined ? music.bpm : base_bpm;
    return bpm / music.baseBeats / 60;
}

/**
 * Opens a file picker and loads a music JSON file
 */
export async function select_and_load_music_file(): Promise<LevelData> {
    return new Promise((resolve, reject) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,application/json";

        input.onchange = async (event: Event) => {
            const target = event.target as HTMLInputElement;
            const file = target.files?.[0];

            if (!file) {
                reject(new Error("No file selected"));
                return;
            }

            try {
                const text = await file.text();
                const json = JSON.parse(text);
                const level_data = load_level_from_json(json);
                resolve(level_data);
            } catch (error) {
                reject(error instanceof Error ? error : new Error("Failed to load file"));
            }
        };

        input.click();
    });
}

/**
 * Loads level data from a parsed JSON object
 */
export function load_level_from_json(json: unknown): LevelData {
    const data = validate_music_input(json);

    // Process all musics
    const all_rows: RowTypeResult[] = [];
    const musics_metadata: MusicMetadata[] = [];

    let current_row_index = 0;

    for (const music of data.musics) {
        const rows = process_music({
            id: music.id,
            baseBeats: music.baseBeats,
            scores: music.scores,
        });

        const tps = calculate_tps(music, data.baseBpm);

        musics_metadata.push({
            id: music.id,
            tps,
            start_row_index: current_row_index,
            end_row_index: current_row_index + rows.length,
            row_count: rows.length,
        });

        all_rows.push(...rows);
        current_row_index += rows.length;
    }

    // Convert to MIDI JSON for audio playback
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
