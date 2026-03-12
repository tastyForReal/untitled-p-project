import { log_message } from './logger.js';
import { MidiJson, MidiNote } from './midi_types.js';
import { NoteIndicatorData, RowData, RowType, SCREEN_CONFIG } from './types.js';

export type { NoteIndicatorData };

const INDICATOR_SIZE = 16;
const INDICATOR_Y_OFFSET = -8;

export function build_note_indicators(
    midi_json: MidiJson,
    rows: RowData[],
    musics_metadata: { tps: number; start_row_index: number; end_row_index: number }[],
): NoteIndicatorData[] {
    const indicators: NoteIndicatorData[] = [];

    if (!midi_json || midi_json.tracks.length === 0 || rows.length === 0) {
        return indicators;
    }

    const all_notes: { note: MidiNote; note_id: number; track_idx: number }[] = [];
    for (let track_idx = 0; track_idx < midi_json.tracks.length; track_idx++) {
        const track = midi_json.tracks[track_idx];
        if (!track) continue;
        for (const note of track.notes) {
            const note_id = Math.round(note.time * 1000) * 1000000 + track_idx * 1000 + note.midi;
            all_notes.push({ note, note_id, track_idx });
        }
    }

    all_notes.sort((a, b) => a.note.time - b.note.time);

    const level_row_times: { row_index: number; start_time: number; end_time: number }[] = [];
    let cumulative_time = 0;

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const level_row_index = row.row_index - 1;

        let tps: number = SCREEN_CONFIG.DEFAULT_TPS;
        for (const music of musics_metadata) {
            if (level_row_index >= music.start_row_index && level_row_index < music.end_row_index) {
                tps = music.tps;
                break;
            }
        }

        const row_start_time = cumulative_time;

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

    for (const { note, note_id, track_idx } of all_notes) {
        if (note.midi < 21 || note.midi > 108) {
            continue;
        }

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

        if (row.row_type === RowType.StartingTileRow || row.tiles.length === 0) {
            continue;
        }

        const time_fraction =
            (note.time - target_row_info.start_time) / (target_row_info.end_time - target_row_info.start_time);

        const row_bottom = row.y_position + row.height;
        const base_height_edge = row_bottom - SCREEN_CONFIG.BASE_ROW_HEIGHT;
        const indicator_y = base_height_edge - time_fraction * row.height + INDICATOR_Y_OFFSET;

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

    log_message(`[NoteIndicator] Built ${indicators.length} indicators from ${all_notes.length} notes`);
    return indicators;
}

export function consume_indicator_by_note_id(indicators: NoteIndicatorData[], note_id: number): boolean {
    for (const indicator of indicators) {
        if (indicator.note_id === note_id && !indicator.is_consumed) {
            indicator.is_consumed = true;
            return true;
        }
    }
    return false;
}

export function get_active_indicators(indicators: NoteIndicatorData[]): NoteIndicatorData[] {
    return indicators.filter(ind => !ind.is_consumed);
}
