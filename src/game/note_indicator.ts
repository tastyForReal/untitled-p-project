import { MidiJson, MidiNote } from './midi_types.js';
import { NoteIndicatorData, RowData, RowType, SCREEN_CONFIG } from './types.js';

export type { NoteIndicatorData };

const INDICATOR_SIZE = 16;
const INDICATOR_Y_OFFSET = -8;

/**
 * Builds an array of NoteIndicatorData from MIDI data and row layout.
 *
 * Each indicator is placed on a non-yellow tile at a Y position determined by
 * the MIDI note's time relative to the tile's timing window. The timing window
 * maps the playback timeline onto the tile's vertical space using the base row
 * height as the unit: time 0 sits at the base-height edge and each additional
 * unit of time moves one base-row-height upward.
 */
export function build_note_indicators(
    midi_json: MidiJson,
    rows: RowData[],
    musics_metadata: { tps: number; start_row_index: number; end_row_index: number }[],
): NoteIndicatorData[] {
    const indicators: NoteIndicatorData[] = [];

    if (!midi_json || midi_json.tracks.length === 0 || rows.length === 0) {
        return indicators;
    }

    // Collect all notes from all tracks with unique IDs
    const all_notes: { note: MidiNote; note_id: number; track_idx: number }[] = [];
    for (let track_idx = 0; track_idx < midi_json.tracks.length; track_idx++) {
        const track = midi_json.tracks[track_idx];
        if (!track) continue;
        for (const note of track.notes) {
            // Include track_idx in note_id to make it truly unique across tracks
            const note_id = Math.round(note.time * 1000) * 1000000 + track_idx * 1000 + note.midi;
            all_notes.push({ note, note_id, track_idx });
        }
    }

    // Sort notes by time ascending
    all_notes.sort((a, b) => a.note.time - b.note.time);

    // Build a cumulative time map: for each row, track the playback time at
    // which the row's base-height edge passes the timing line.
    // Row index 0 is the START row (yellow) — skip it.
    // Level rows start at row_index 1 in `rows`.

    // Calculate the cumulative time for each level row's base-height edge.
    // Each row contributes (height_multiplier / tps) seconds of scroll time.
    const level_row_times: { row_index: number; start_time: number; end_time: number }[] = [];
    let cumulative_time = 0;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const level_row_index = row.row_index - 1; // 0-based level row index

        // Find which music section this row belongs to, to get TPS
        let tps: number = SCREEN_CONFIG.DEFAULT_TPS;
        for (const music of musics_metadata) {
            if (level_row_index >= music.start_row_index && level_row_index < music.end_row_index) {
                tps = music.tps;
                break;
            }
        }

        const row_start_time = cumulative_time;
        // The time it takes for one base-height unit to scroll past
        const time_per_base_height = 1 / tps;
        const row_duration = row.height_multiplier * time_per_base_height;
        const row_end_time = cumulative_time + row_duration;

        level_row_times.push({
            row_index: i,
            start_time: row_start_time,
            end_time: row_end_time,
        });

        cumulative_time = row_end_time;
    }

    // For each note, find which row's time window it falls into and place an indicator
    for (const { note, note_id, track_idx } of all_notes) {
        // Skip notes with MIDI values outside valid range
        if (note.midi < 21 || note.midi > 108) {
            continue;
        }

        // Find the row whose time window contains this note
        let target_row_info: (typeof level_row_times)[0] | null = null;
        for (const row_info of level_row_times) {
            if (note.time >= row_info.start_time && note.time < row_info.end_time) {
                target_row_info = row_info;
                break;
            }
        }

        if (!target_row_info) {
            continue;
        }

        const row = rows[target_row_info.row_index];
        if (!row) continue;

        // Skip START (yellow) rows and rows with no tiles
        if (row.row_type === RowType.START || row.tiles.length === 0) {
            continue;
        }

        // Calculate Y position within the row:
        // The fractional time within this row (0 = start_time, 1 = end_time)
        const time_fraction =
            (note.time - target_row_info.start_time) / (target_row_info.end_time - target_row_info.start_time);

        // Map fraction to Y position within the tile:
        // time_fraction 0 → bottom of tile (base height edge), goes upward
        // Y position in the row coordinate: row.y_position is the top of the row
        // row bottom = row.y_position + row.height
        // base_height edge = row bottom - BASE_ROW_HEIGHT
        // indicator_y = base_height_edge - (time_fraction * row.height) + INDICATOR_Y_OFFSET
        const row_bottom = row.y_position + row.height;
        const base_height_edge = row_bottom - SCREEN_CONFIG.BASE_ROW_HEIGHT;
        const indicator_y = base_height_edge - time_fraction * row.height + INDICATOR_Y_OFFSET;

        // X position: half screen window X position (centered)
        const indicator_x = (SCREEN_CONFIG.WIDTH - INDICATOR_SIZE) / 2;

        indicators.push({
            note_id,
            row_index: target_row_info.row_index,
            x: indicator_x,
            y: indicator_y,
            width: INDICATOR_SIZE,
            height: INDICATOR_SIZE,
            time: note.time,
            time_fraction,
            track_idx,
            midi: note.midi,
            is_consumed: false,
        });
    }

    console.log(`[NoteIndicator] Built ${indicators.length} indicators from ${all_notes.length} notes`);
    return indicators;
}

/**
 * Marks the first unconsumed indicator matching the given note_id as consumed.
 * Returns true if an indicator was consumed, false otherwise.
 */
export function consume_indicator_by_note_id(indicators: NoteIndicatorData[], note_id: number): boolean {
    for (const indicator of indicators) {
        if (indicator.note_id === note_id && !indicator.is_consumed) {
            indicator.is_consumed = true;
            return true;
        }
    }
    return false;
}

/**
 * Returns all indicators that are not yet consumed.
 */
export function get_active_indicators(indicators: NoteIndicatorData[]): NoteIndicatorData[] {
    return indicators.filter(ind => !ind.is_consumed);
}
