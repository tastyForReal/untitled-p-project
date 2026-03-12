import {
    GameData,
    GameState,
    RowData,
    RowType,
    TileData,
    SCREEN_CONFIG,
    NoteIndicatorData,
    MusicMetadata,
    RowTiming,
    GameMode,
    EndlessConfig,
} from './types.js';
import { generate_all_rows, is_row_visible, DEFAULT_ROW_COUNT, create_tile } from './row_generator.js';
import { ParticleSystem } from './particle_system.js';
import { point_in_rect } from '../utils/math_utils.js';
import { RowTypeResult, LevelData } from './json_level_reader.js';
import { get_audio_manager, AudioManager } from './audio_manager.js';
import { build_note_indicators, get_active_indicators } from './note_indicator.js';
import { ScoreManager } from './score_manager.js';
import { ScoreData } from './score_types.js';
import { initialize_logger, log_message } from './logger.js';
import { Color } from '../graphics/color.js';

export interface GameConfig {
    row_count: number;
    is_bot_active: boolean;
    is_red_note_indicator_enabled: boolean;
    is_logging_enabled: boolean;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
    row_count: DEFAULT_ROW_COUNT,
    is_bot_active: false,
    is_red_note_indicator_enabled: false,
    is_logging_enabled: false,
};

export function create_initial_game_state(config: GameConfig = DEFAULT_GAME_CONFIG): GameData {
    const rows = generate_all_rows(config.row_count);

    return {
        state: GameState.Paused,
        rows,
        particles: [],
        total_completed_height: 0,
        scroll_offset: 0,
        game_over_data: null,
        game_over_animation: null,
        game_won_time: null,
        last_single_lane: 0,
        last_double_lanes: null,
        active_row_index: 0,
        completed_rows_count: 0,

        current_tps: SCREEN_CONFIG.DEFAULT_TPS,
        current_music_index: 0,
        musics_metadata: [],

        current_midi_time: 0,
        midi_loaded: false,
        has_game_started: false,
        note_indicators: [],
        midi_playing: false,
        target_time_for_next_note: 0,
        current_dt_press_count: 0,
        skipped_midi_notes: [],
        level_row_timings: [],
        game_mode: GameMode.OneRound,
        endless_config: null,
        loop_count: 0,
        current_filename: 'Untitled P Project',
        raw_level_rows: [],
        loop_0_midi_notes: [],
    };
}

export function calculate_level_row_timings(rows: RowData[], musics_metadata: MusicMetadata[]): RowTiming[] {
    const timings: RowTiming[] = [];
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

        timings.push({
            start_time: row_start_time,
            mid_time: (row_start_time + row_end_time) / 2,
            end_time: row_end_time,
        });

        cumulative_time = row_end_time;
    }

    return timings;
}

function determine_double_lanes(preceding_row: RowData | null): [number, number] {
    if (preceding_row === null) {
        return Math.random() < 0.5 ? [0, 2] : [1, 3];
    }

    if (preceding_row.row_type === RowType.SingleTileRow || preceding_row.row_type === RowType.StartingTileRow) {
        const single_lane = preceding_row.tiles[0]?.lane_index;
        if (single_lane === undefined) {
            return Math.random() < 0.5 ? [0, 2] : [1, 3];
        }

        if (single_lane === 0 || single_lane === 2) {
            return [1, 3];
        } else {
            return [0, 2];
        }
    }

    if (preceding_row.row_type === RowType.DoubleTileRow) {
        const occupied_lanes = preceding_row.tiles.map(r => r.lane_index);

        if (occupied_lanes.includes(0) && occupied_lanes.includes(2)) {
            return [1, 3];
        } else {
            return [0, 2];
        }
    }

    return Math.random() < 0.5 ? [0, 2] : [1, 3];
}

export function generate_rows_from_level_data(level_rows: RowTypeResult[]): RowData[] {
    const rows: RowData[] = [];

    const start_y = SCREEN_CONFIG.HEIGHT - SCREEN_CONFIG.BASE_ROW_HEIGHT * 2;
    const start_lane = Math.floor(Math.random() * 4);
    const start_tile = create_tile(start_lane, start_y, SCREEN_CONFIG.BASE_ROW_HEIGHT, Color.Yellow, 1.0);

    rows.push({
        row_index: 0,
        row_type: RowType.StartingTileRow,
        height_multiplier: 1,
        y_position: start_y,
        height: SCREEN_CONFIG.BASE_ROW_HEIGHT,
        tiles: [start_tile],
        is_completed: false,
        is_active: true,
    });

    let current_y = start_y;
    let last_single_lane = start_lane;

    for (let i = 0; i < level_rows.length; i++) {
        const row_data = level_rows[i];
        if (!row_data) continue;
        const row_height = row_data.height_multiplier * SCREEN_CONFIG.BASE_ROW_HEIGHT;
        current_y -= row_height;

        const row_index = i + 1;
        const preceding_row = rows[rows.length - 1];
        let tiles: TileData[] = [];

        if (row_data.type === RowType.SingleTileRow) {
            let lane: number;

            if (preceding_row && preceding_row.row_type === RowType.DoubleTileRow) {
                const occupied = preceding_row.tiles.map(r => r.lane_index);
                const empty_lanes = [0, 1, 2, 3].filter(s => !occupied.includes(s));
                const chosen_lane = empty_lanes[Math.floor(Math.random() * empty_lanes.length)];
                lane = chosen_lane ?? 0;
            } else {
                const available_lanes = [0, 1, 2, 3].filter(s => s !== last_single_lane);
                const chosen_lane = available_lanes[Math.floor(Math.random() * available_lanes.length)];
                lane = chosen_lane ?? 0;
            }

            tiles = [create_tile(lane, current_y, row_height, Color.Black, 1.0)];
            last_single_lane = lane;
        } else if (row_data.type === RowType.DoubleTileRow) {
            const lanes = determine_double_lanes(preceding_row ?? null);
            tiles = lanes.map(lane => create_tile(lane, current_y, row_height, Color.Black, 1.0));
        }

        rows.push({
            row_index: row_index,
            row_type: row_data.type,
            height_multiplier: row_data.height_multiplier,
            y_position: current_y,
            height: row_height,
            tiles,
            is_completed: row_data.type === RowType.EmptyRow,
            is_active: false,
        });
    }

    return rows;
}

export class GameStateManager {
    private game_data: GameData;
    private particle_system: ParticleSystem;
    private config: GameConfig;
    private audio_manager: AudioManager;
    private score_manager: ScoreManager;

    constructor(config: GameConfig = DEFAULT_GAME_CONFIG) {
        this.config = config;
        initialize_logger(config.is_logging_enabled);
        this.game_data = create_initial_game_state(config);
        this.particle_system = new ParticleSystem();
        this.audio_manager = get_audio_manager();
        this.score_manager = new ScoreManager();
    }

    get_game_data(): GameData {
        return this.game_data;
    }

    get_particle_system(): ParticleSystem {
        return this.particle_system;
    }

    reset(): void {
        this.game_data = create_initial_game_state(this.config);
        this.particle_system.clear();
        this.audio_manager.stop_all_samples();
        this.audio_manager.clear_midi_data();
        this.score_manager.reset();
        document.title = 'Untitled P Project';
    }

    load_level(
        level_data: LevelData,
        game_mode: GameMode = GameMode.OneRound,
        endless_config: EndlessConfig | null = null,
        filename: string = '',
    ): void {
        const rows = generate_rows_from_level_data(level_data.rows);

        const initial_tps =
            level_data.musics.length > 0
                ? (level_data.musics[0]?.tps ?? SCREEN_CONFIG.DEFAULT_TPS)
                : SCREEN_CONFIG.DEFAULT_TPS;

        const is_midi_loaded = level_data.midi_json !== null;
        log_message(`[GameState] Loading level:`);
        log_message(`  - Total rows: ${rows.length}`);
        log_message(`  - Music sections: ${level_data.musics.length}`);
        log_message(`  - Base BPM: ${level_data.base_bpm}`);
        log_message(`  - Initial TPS: ${initial_tps.toFixed(2)}`);
        log_message(`  - MIDI loaded: ${is_midi_loaded}`);

        if (level_data.midi_json) {
            log_message(`  - MIDI tracks: ${level_data.midi_json.tracks.length}`);
            this.audio_manager.load_midi_data(level_data.midi_json);
        } else {
            this.audio_manager.clear_midi_data();
        }

        const level_row_timings = calculate_level_row_timings(rows, level_data.musics);

        this.game_data = {
            state: GameState.Paused,
            rows,
            particles: [],
            total_completed_height: 0,
            scroll_offset: 0,
            game_over_data: null,
            game_over_animation: null,
            game_won_time: null,
            last_single_lane: 0,
            last_double_lanes: null,
            active_row_index: 0,
            completed_rows_count: 0,

            current_tps:
                game_mode === GameMode.Survival && endless_config?.starting_tps !== undefined
                    ? endless_config.starting_tps
                    : initial_tps,
            current_music_index: 0,
            musics_metadata: level_data.musics,

            current_midi_time: 0,
            midi_loaded: is_midi_loaded,
            has_game_started: false,
            note_indicators: [],
            midi_playing: false,
            target_time_for_next_note: 0,
            current_dt_press_count: 0,
            skipped_midi_notes: [],
            level_row_timings,
            game_mode,
            endless_config,
            loop_count: 0,
            current_filename: filename,
            raw_level_rows: level_data.rows,
            loop_0_midi_notes: [],
        };

        if (level_data.midi_json) {
            const all_loop_notes: {
                track_idx: number;
                midi: number;
                original_time: number;
                row_index: number;
                time_fraction: number;
            }[] = [];
            for (let track_idx = 0; track_idx < level_data.midi_json.tracks.length; track_idx++) {
                const track = level_data.midi_json.tracks[track_idx];
                if (!track) continue;
                for (const note of track.notes) {
                    let target_row_index = -1;
                    let target_fraction = 0;
                    for (let r = 0; r < level_row_timings.length; r++) {
                        const timing = level_row_timings[r];
                        if (timing && note.time >= timing.start_time && note.time <= timing.end_time) {
                            if (timing.end_time > timing.start_time) {
                                target_row_index = r + 1;
                                target_fraction =
                                    (note.time - timing.start_time) / (timing.end_time - timing.start_time);
                                break;
                            }
                        }
                    }
                    if (target_row_index !== -1) {
                        all_loop_notes.push({
                            track_idx,
                            midi: note.midi,
                            original_time: note.time,
                            row_index: target_row_index,
                            time_fraction: target_fraction,
                        });
                    }
                }
            }
            this.game_data.loop_0_midi_notes = all_loop_notes;

            this.game_data.note_indicators = build_note_indicators(
                level_data.midi_json,
                this.game_data.rows,
                level_data.musics,
            );
            log_message(`[GameState] Built ${this.game_data.note_indicators.length} note indicators`);
        }
        this.particle_system.clear();

        this.score_manager.reset();
    }

    load_custom_rows(level_rows: RowTypeResult[]): void {
        const rows = generate_rows_from_level_data(level_rows);
        this.game_data = {
            state: GameState.Paused,
            rows,
            particles: [],
            total_completed_height: 0,
            scroll_offset: 0,
            game_over_data: null,
            game_over_animation: null,
            game_won_time: null,
            last_single_lane: 0,
            last_double_lanes: null,
            active_row_index: 0,
            completed_rows_count: 0,
            current_tps: SCREEN_CONFIG.DEFAULT_TPS,
            current_music_index: 0,
            musics_metadata: [],
            current_midi_time: 0,
            midi_loaded: false,
            has_game_started: false,
            note_indicators: [],
            midi_playing: false,
            target_time_for_next_note: 0,
            current_dt_press_count: 0,
            skipped_midi_notes: [],
            level_row_timings: [],
            game_mode: GameMode.OneRound,
            endless_config: null,
            loop_count: 0,
            current_filename: '',
            raw_level_rows: level_rows,
            loop_0_midi_notes: [],
        };
        this.particle_system.clear();
        this.audio_manager.clear_midi_data();
        this.score_manager.reset();
    }

    start(): void {
        if (this.game_data.state === GameState.Paused) {
            this.game_data.state = GameState.Resumed;
        }
    }

    toggle_pause(allow_with_bot: boolean = false): void {
        if (this.config.is_bot_active && !allow_with_bot) return;

        if (this.game_data.state === GameState.Resumed) {
            this.game_data.state = GameState.Paused;
        } else if (this.game_data.state === GameState.Paused) {
            this.game_data.state = GameState.Resumed;
        }
    }

    is_paused(): boolean {
        return (
            this.game_data.state === GameState.Paused ||
            this.game_data.state === GameState.TileMisclicked ||
            this.game_data.state === GameState.TileFellOffScreen ||
            this.game_data.state === GameState.Cleared
        );
    }

    is_game_over(): boolean {
        return (
            this.game_data.state === GameState.TileMisclicked ||
            this.game_data.state === GameState.TileFellOffScreen ||
            this.game_data.state === GameState.Cleared
        );
    }

    has_game_started(): boolean {
        return this.game_data.has_game_started;
    }

    is_start_tile_pressed(): boolean {
        const start_row = this.game_data.rows.find(r => r.row_type === RowType.StartingTileRow);
        return start_row?.is_completed ?? false;
    }

    private get_scroll_speed(): number {
        return this.game_data.current_tps * SCREEN_CONFIG.BASE_ROW_HEIGHT;
    }

    private update_challenge_tps(delta_time: number): void {
        if (this.game_data.game_mode === GameMode.Survival && this.game_data.endless_config?.acceleration_rate) {
            this.game_data.current_tps += this.game_data.endless_config.acceleration_rate * delta_time;
        }
    }

    private check_and_update_music_for_row(row: RowData): boolean {
        const musics = this.game_data.musics_metadata;
        if (musics.length === 0) return false;
        if (row.row_type === RowType.StartingTileRow) return false;

        const level_row_index = row.row_index - 1;

        for (let i = 0; i < musics.length; i++) {
            const music = musics[i];
            if (!music) continue;
            if (level_row_index >= music.start_row_index && level_row_index < music.end_row_index) {
                if (this.game_data.current_music_index !== i) {
                    const previous_tps = this.game_data.current_tps;
                    this.game_data.current_music_index = i;

                    if (this.game_data.game_mode !== GameMode.Survival) {
                        this.game_data.current_tps = music.tps;
                        log_message(
                            `[GameState] Transitioned to section ${i}, TPS updating to ${music.tps.toFixed(3)}`,
                        );
                    }

                    log_message(
                        `[GameState] Music transition: TPS ${previous_tps.toFixed(2)} -> ${this.game_data.current_tps.toFixed(2)}, music index ${i}`,
                    );
                    return true;
                }
                break;
            }
        }
        return false;
    }

    update_scroll(delta_time: number): void {
        if (this.is_paused() || this.is_game_over()) {
            return;
        }

        this.update_challenge_tps(delta_time);

        const scroll_speed = this.get_scroll_speed();
        const scroll_delta = scroll_speed * delta_time;
        this.game_data.scroll_offset += scroll_delta;

        if (this.game_data.has_game_started) {
            const previous_stopwatch = this.game_data.current_midi_time;

            if (this.game_data.midi_playing) {
                const current_music = this.game_data.musics_metadata[this.game_data.current_music_index];
                const native_tps = current_music?.tps ?? SCREEN_CONFIG.DEFAULT_TPS;
                const speed_multiplier = this.game_data.current_tps / native_tps;

                this.game_data.current_midi_time += delta_time * speed_multiplier;

                if (this.game_data.current_midi_time >= this.game_data.target_time_for_next_note) {
                    this.game_data.current_midi_time = this.game_data.target_time_for_next_note - 0.0001;
                    this.game_data.midi_playing = false;
                }

                if (this.game_data.midi_loaded) {
                    const played_note_ids = this.audio_manager.update_midi_playback(
                        this.game_data.current_midi_time,
                        this.game_data.skipped_midi_notes,
                    );
                    this.spawn_note_hit_animations(played_note_ids);
                }
            }

            if (Math.floor(this.game_data.current_midi_time * 2) !== Math.floor(previous_stopwatch * 2)) {
                log_message(
                    `[GameState] Stopwatch: ${this.game_data.current_midi_time.toFixed(3)}s, Target: ${this.game_data.target_time_for_next_note.toFixed(3)}s, Resumed: ${this.game_data.midi_playing}`,
                );
            }
        }

        const active_row = this.get_active_row();
        if (active_row) {
            for (const rect of active_row.tiles) {
                if (rect.is_holding && !rect.is_pressed) {
                    rect.progress += scroll_delta;
                    if (rect.progress >= rect.height) {
                        rect.progress = rect.height;
                        rect.is_holding = false;
                        this.complete_tile(rect, active_row, rect.y + this.game_data.scroll_offset, false);
                    }
                }
            }
        }

        this.update_active_row();
        this.check_and_handle_endless_loop();
    }

    private check_and_handle_endless_loop(): void {
        if (this.game_data.game_mode === GameMode.OneRound) return;
        if (this.game_data.raw_level_rows.length === 0) return;

        const musics = this.game_data.musics_metadata;
        if (musics.length === 0) return;

        const last_music = musics[musics.length - 1];
        if (!last_music) return;

        if (this.game_data.current_music_index === musics.length - 1) {
            const rows_per_loop = last_music.end_row_index;
            const expected_total_rows = (this.game_data.loop_count + 2) * rows_per_loop + 1;

            if (this.game_data.rows.length < expected_total_rows) {
                log_message(
                    `[GameState] Reached last section, regenerating level rows for loop ${this.game_data.loop_count + 1}`,
                );
                this.append_level_loop();

                const cleanup_threshold_index = this.game_data.active_row_index - 100;
                this.game_data.note_indicators = this.game_data.note_indicators.filter(
                    ind => ind.row_index >= cleanup_threshold_index,
                );
            }
        }
    }

    private append_level_loop(): void {
        const raw_rows = this.game_data.raw_level_rows;
        if (raw_rows.length === 0) return;

        const current_rows = this.game_data.rows;
        const last_existing_row = current_rows[current_rows.length - 1];
        if (!last_existing_row) return;

        const base_row_index = current_rows.length;
        let current_y = last_existing_row.y_position;
        let last_single_lane = 0;
        if (last_existing_row.tiles.length > 0) {
            last_single_lane = last_existing_row.tiles[0]?.lane_index ?? 0;
        }

        for (let i = 0; i < raw_rows.length; i++) {
            const row_data = raw_rows[i];
            if (!row_data) continue;

            const row_height = row_data.height_multiplier * SCREEN_CONFIG.BASE_ROW_HEIGHT;
            current_y -= row_height;
            const row_index = base_row_index + i;
            const preceding_row = current_rows[current_rows.length - 1];
            let tiles: TileData[] = [];

            if (row_data.type === RowType.SingleTileRow) {
                let lane: number;
                if (preceding_row && preceding_row.row_type === RowType.DoubleTileRow) {
                    const occupied = preceding_row.tiles.map(r => r.lane_index);
                    const empty_lanes = [0, 1, 2, 3].filter(s => !occupied.includes(s));
                    const chosen = empty_lanes[Math.floor(Math.random() * empty_lanes.length)];
                    lane = chosen ?? 0;
                } else {
                    const available = [0, 1, 2, 3].filter(s => s !== last_single_lane);
                    const chosen = available[Math.floor(Math.random() * available.length)];
                    lane = chosen ?? 0;
                }
                tiles = [create_tile(lane, current_y, row_height, Color.Black, 1.0)];
                last_single_lane = lane;
            } else if (row_data.type === RowType.DoubleTileRow) {
                const lanes = this.determine_double_lanes_from_row(preceding_row ?? null);
                tiles = lanes.map(lane => create_tile(lane, current_y, row_height, Color.Black, 1.0));
            }

            current_rows.push({
                row_index,
                row_type: row_data.type,
                height_multiplier: row_data.height_multiplier,
                y_position: current_y,
                height: row_height,
                tiles,
                is_completed: row_data.type === RowType.EmptyRow,
                is_active: false,
            });
        }

        const original_total = this.game_data.raw_level_rows.length;
        const original_musics = this.game_data.musics_metadata.filter(m => m.start_row_index < original_total);
        const rows_per_loop = original_total;
        const new_loop_offset = (this.game_data.loop_count + 1) * rows_per_loop;

        let tps_accumulator =
            this.game_data.musics_metadata[this.game_data.musics_metadata.length - 1]?.tps ?? SCREEN_CONFIG.DEFAULT_TPS;

        for (const music of original_musics) {
            if (this.game_data.game_mode === GameMode.Endless) {
                tps_accumulator += 0.333;
            }
            this.game_data.musics_metadata.push({
                id: music.id,
                tps: this.game_data.game_mode === GameMode.Endless ? tps_accumulator : music.tps,
                bpm: music.bpm,
                base_beats: music.base_beats,
                start_row_index: music.start_row_index + new_loop_offset,
                end_row_index: music.end_row_index + new_loop_offset,
                row_count: music.row_count,
            });
        }

        const new_timings = calculate_level_row_timings(current_rows, this.game_data.musics_metadata);
        this.game_data.level_row_timings = new_timings;

        const AUDIO_MANAGER = get_audio_manager();

        const loop_0_indicators = this.game_data.note_indicators.filter(ind => ind.row_index <= original_total);

        for (const ind of loop_0_indicators) {
            if (ind.time_fraction === undefined || ind.track_idx === undefined || ind.midi === undefined) continue;

            const new_row_index = ind.row_index + new_loop_offset;
            const new_row_timing = new_timings[new_row_index - 1];
            if (!new_row_timing) continue;

            const new_time =
                new_row_timing.start_time + ind.time_fraction * (new_row_timing.end_time - new_row_timing.start_time);

            const new_row = current_rows.find(r => r.row_index === new_row_index);
            if (!new_row) continue;

            const row_bottom = new_row.y_position + new_row.height;
            const base_height_edge = row_bottom - SCREEN_CONFIG.BASE_ROW_HEIGHT;
            const indicator_y = base_height_edge - ind.time_fraction * new_row.height - 8;

            const new_note_id = Math.round(new_time * 1000) * 1000000 + ind.track_idx * 1000 + ind.midi;

            this.game_data.note_indicators.push({
                note_id: new_note_id,
                row_index: new_row_index,
                x: ind.x,
                y: indicator_y,
                width: ind.width,
                height: ind.height,
                time: new_time,
                time_fraction: ind.time_fraction,
                track_idx: ind.track_idx,
                midi: ind.midi,
                is_consumed: false,
            });
        }

        for (const mn of this.game_data.loop_0_midi_notes) {
            const new_row_index = mn.row_index + new_loop_offset;
            const new_row_timing = new_timings[new_row_index - 1];
            if (!new_row_timing) continue;

            const new_time =
                new_row_timing.start_time + mn.time_fraction * (new_row_timing.end_time - new_row_timing.start_time);
            AUDIO_MANAGER.add_dynamic_midi_note(mn.track_idx, mn.midi, new_time);
        }

        this.game_data.loop_count++;
        log_message(`[GameState] Loop ${this.game_data.loop_count} appended: total rows now ${current_rows.length}`);
    }

    private determine_double_lanes_from_row(preceding_row: RowData | null): [number, number] {
        if (preceding_row === null) {
            return Math.random() < 0.5 ? [0, 2] : [1, 3];
        }
        if (preceding_row.row_type === RowType.SingleTileRow || preceding_row.row_type === RowType.StartingTileRow) {
            const single_lane = preceding_row.tiles[0]?.lane_index;
            if (single_lane === undefined) return Math.random() < 0.5 ? [0, 2] : [1, 3];
            return single_lane === 0 || single_lane === 2 ? [1, 3] : [0, 2];
        }
        if (preceding_row.row_type === RowType.DoubleTileRow) {
            const occupied = preceding_row.tiles.map(r => r.lane_index);
            return occupied.includes(0) && occupied.includes(2) ? [1, 3] : [0, 2];
        }
        return Math.random() < 0.5 ? [0, 2] : [1, 3];
    }

    update_bot(): void {
        if (!this.config.is_bot_active || this.is_game_over()) {
            return;
        }

        const active_row = this.get_active_row();
        if (!active_row) return;

        if (active_row.row_type === RowType.StartingTileRow) {
            return;
        }

        const row_top = active_row.y_position + this.game_data.scroll_offset;
        const row_bottom = row_top + active_row.height;
        const trigger_y = SCREEN_CONFIG.HEIGHT / 2;

        const is_long_tile = active_row.height > SCREEN_CONFIG.BASE_ROW_HEIGHT;

        if (is_long_tile) {
            const long_tile_trigger = row_bottom - SCREEN_CONFIG.BASE_ROW_HEIGHT;
            if (long_tile_trigger >= trigger_y) {
                for (const rect of active_row.tiles) {
                    if (!rect.is_pressed && !rect.is_holding) {
                        rect.is_holding = true;
                        rect.last_note_played_at = performance.now();
                        rect.active_circle_animations.push(rect.last_note_played_at);

                        rect.progress = SCREEN_CONFIG.BASE_ROW_HEIGHT;

                        this.check_and_update_music_for_row(active_row);

                        if (!this.game_data.has_game_started) {
                            this.game_data.has_game_started = true;
                            this.game_data.current_midi_time = 0;
                            log_message(`[GameState] Game started via bot (long tile)`);
                        }

                        this.update_midi_playback_for_row(active_row);

                        this.play_tile_sound();
                    } else if (rect.is_holding) {
                        this.update_midi_playback_for_row(active_row);
                    }
                }
            }
        } else {
            if (row_top >= trigger_y) {
                for (const rect of active_row.tiles) {
                    if (!rect.is_pressed) {
                        this.press_tile(rect, active_row, rect.y + this.game_data.scroll_offset);
                    }
                }
            }
        }
    }

    private update_active_row(): void {
        const current_active_row = this.get_active_row();
        if (current_active_row && current_active_row.row_type !== RowType.StartingTileRow) {
            const screen_y = current_active_row.y_position + this.game_data.scroll_offset;
            if (screen_y > SCREEN_CONFIG.HEIGHT) {
                if (!current_active_row.is_completed) {
                    this.trigger_game_over_out_of_bounds(current_active_row);
                    return;
                }
            }
        }

        const start_idx = Math.max(0, this.game_data.active_row_index - 5);
        let has_incomplete = false;

        for (let i = start_idx; i < this.game_data.rows.length; i++) {
            const row = this.game_data.rows[i];
            if (row && !row.is_completed) {
                has_incomplete = true;
                break;
            }
        }

        if (!has_incomplete && this.game_data.rows.length > 0) {
            const last_row = this.game_data.rows[this.game_data.rows.length - 1];
            if (last_row) {
                const last_row_screen_y = last_row.y_position + this.game_data.scroll_offset;
                if (last_row_screen_y > SCREEN_CONFIG.HEIGHT) {
                    this.trigger_game_won();
                    return;
                }
            }
        }

        const visible_incomplete_rows: RowData[] = [];
        for (let i = start_idx; i < this.game_data.rows.length; i++) {
            const row = this.game_data.rows[i];
            if (!row) continue;

            if (!row.is_completed && is_row_visible(row, this.game_data.scroll_offset)) {
                visible_incomplete_rows.push(row);
            }

            const row_bottom_screen_y = row.y_position + this.game_data.scroll_offset + row.height;
            if (row_bottom_screen_y < 0) {
                break;
            }
        }

        if (visible_incomplete_rows.length > 0) {
            visible_incomplete_rows.sort((a, b) => b.y_position - a.y_position);
            const new_active_row = visible_incomplete_rows[0];
            if (new_active_row) {
                this.game_data.active_row_index = new_active_row.row_index;
            }
        }
    }

    get_active_row(): RowData | null {
        const active_index = this.game_data.active_row_index;
        if (active_index >= 0 && active_index < this.game_data.rows.length) {
            const row = this.game_data.rows[active_index];
            return row ?? null;
        }
        return null;
    }

    private play_tile_sound(): void {
        if (!this.game_data.midi_loaded) {
            this.audio_manager.play_random_sample();
        }
    }

    handle_lane_input(lane_index: number, screen_x: number, screen_y: number, is_down: boolean): boolean {
        if (this.is_game_over()) {
            return false;
        }

        const start_row = this.game_data.rows.find(r => r.row_type === RowType.StartingTileRow);

        if (is_down && this.game_data.state === GameState.Paused && start_row && !start_row.is_completed) {
            const start_rect = start_row.tiles[0];
            if (start_rect) {
                const start_screen_y = start_rect.y + this.game_data.scroll_offset;
                if (
                    point_in_rect(screen_x, screen_y, start_rect.x, start_screen_y, start_rect.width, start_rect.height)
                ) {
                    this.press_tile(start_rect, start_row, start_screen_y);
                    this.game_data.state = GameState.Resumed;
                    return true;
                }
            }
            return false;
        }

        const active_row = this.get_active_row();
        if (!active_row) {
            return false;
        }

        const row_top = active_row.y_position + this.game_data.scroll_offset;
        const row_bottom = row_top + active_row.height;
        const pressed_rect = active_row.tiles.find(r => r.lane_index === lane_index);

        if (this.config.is_bot_active) {
            if (is_down) {
                if (!pressed_rect && screen_y >= row_top && screen_y <= row_bottom) {
                    this.trigger_game_over_misclicked(lane_index, screen_x, screen_y, active_row);
                }
            }
            return false;
        }

        if (!is_down) {
            if (pressed_rect && pressed_rect.is_holding && !pressed_rect.is_pressed) {
                pressed_rect.is_holding = false;
                if (pressed_rect.progress < pressed_rect.height) {
                    pressed_rect.is_released_early = true;
                    this.complete_tile(pressed_rect, active_row, pressed_rect.y + this.game_data.scroll_offset, true);
                }
            }
            return false;
        }

        if (pressed_rect && !pressed_rect.is_pressed && !pressed_rect.is_holding) {
            const is_long_tile = active_row.height > SCREEN_CONFIG.BASE_ROW_HEIGHT;
            log_message(`[GameState] handle_lane_input: Tile press detected`);
            log_message(`  - Lane index: ${lane_index}, Is long tile: ${is_long_tile}`);
            log_message(`  - Row height: ${active_row.height}, Base height: ${SCREEN_CONFIG.BASE_ROW_HEIGHT}`);

            if (is_long_tile) {
                const hit_zone_top = row_bottom - SCREEN_CONFIG.BASE_ROW_HEIGHT;
                log_message(
                    `  - Screen Y: ${screen_y.toFixed(1)}, Hit zone: [${hit_zone_top.toFixed(1)}, ${row_bottom.toFixed(1)}]`,
                );
                log_message(`  - In hit zone: ${screen_y >= hit_zone_top && screen_y <= row_bottom}`);

                if (screen_y >= hit_zone_top && screen_y <= row_bottom) {
                    pressed_rect.is_holding = true;
                    pressed_rect.last_note_played_at = performance.now();
                    pressed_rect.active_circle_animations.push(pressed_rect.last_note_played_at);

                    pressed_rect.progress = SCREEN_CONFIG.BASE_ROW_HEIGHT;

                    this.check_and_update_music_for_row(active_row);

                    if (!this.game_data.has_game_started) {
                        this.game_data.has_game_started = true;
                        this.game_data.current_midi_time = 0;
                        log_message(`[GameState] Game started via handle_lane_input (long tile in hit zone)`);
                    }

                    this.update_midi_playback_for_row(active_row);

                    if (active_row.row_type !== RowType.StartingTileRow && !active_row.is_completed) {
                        this.play_tile_sound();
                    }
                } else {
                    log_message(`[GameState] Long tile press OUTSIDE hit zone - game NOT started`);
                }
                return true;
            } else {
                this.press_tile(pressed_rect, active_row, pressed_rect.y + this.game_data.scroll_offset);
                return true;
            }
        } else if (!pressed_rect && screen_y >= row_top && screen_y <= row_bottom) {
            this.trigger_game_over_misclicked(lane_index, screen_x, screen_y, active_row);
            return false;
        }

        return false;
    }

    handle_keyboard_input(lane_index: number, is_down: boolean): boolean {
        if (this.is_game_over()) {
            return false;
        }

        const start_row = this.game_data.rows.find(r => r.row_type === RowType.StartingTileRow);

        if (is_down && this.game_data.state === GameState.Paused && start_row && !start_row.is_completed) {
            const start_rect = start_row.tiles[0];
            if (start_rect && start_rect.lane_index === lane_index) {
                const start_screen_y = start_rect.y + this.game_data.scroll_offset;
                this.press_tile(start_rect, start_row, start_screen_y);
                this.game_data.state = GameState.Resumed;
                return true;
            }
            return false;
        }

        const active_row = this.get_active_row();
        if (!active_row) {
            return false;
        }

        const row_bottom = active_row.y_position + this.game_data.scroll_offset + active_row.height;
        const timing_zone = SCREEN_CONFIG.HEIGHT / 2;

        const pressed_rect = active_row.tiles.find(r => r.lane_index === lane_index);

        if (this.config.is_bot_active) {
            if (is_down) {
                if (!pressed_rect && row_bottom >= timing_zone) {
                    const column_width = SCREEN_CONFIG.WIDTH / 4;
                    const screen_x = lane_index * column_width + column_width / 2;
                    const screen_y = active_row.y_position + this.game_data.scroll_offset + active_row.height / 2;
                    this.trigger_game_over_misclicked(lane_index, screen_x, screen_y, active_row);
                }
            }
            return false;
        }

        if (!is_down) {
            if (pressed_rect && pressed_rect.is_holding && !pressed_rect.is_pressed) {
                pressed_rect.is_holding = false;
                if (pressed_rect.progress < pressed_rect.height) {
                    pressed_rect.is_released_early = true;
                    this.complete_tile(pressed_rect, active_row, pressed_rect.y + this.game_data.scroll_offset, true);
                }
            }
            return false;
        }

        if (row_bottom < timing_zone) {
            return false;
        }

        if (pressed_rect && !pressed_rect.is_pressed && !pressed_rect.is_holding) {
            const is_long_tile = active_row.height > SCREEN_CONFIG.BASE_ROW_HEIGHT;
            log_message(`[GameState] handle_keyboard_input: Tile press detected`);
            log_message(`  - Lane index: ${lane_index}, Is long tile: ${is_long_tile}`);
            log_message(`  - Row height: ${active_row.height}, Base height: ${SCREEN_CONFIG.BASE_ROW_HEIGHT}`);
            log_message(`  - Row bottom: ${row_bottom.toFixed(1)}, Timing zone: ${timing_zone.toFixed(1)}`);

            if (is_long_tile) {
                pressed_rect.is_holding = true;
                pressed_rect.last_note_played_at = performance.now();
                pressed_rect.active_circle_animations.push(pressed_rect.last_note_played_at);

                pressed_rect.progress = SCREEN_CONFIG.BASE_ROW_HEIGHT;

                this.check_and_update_music_for_row(active_row);

                if (!this.game_data.has_game_started) {
                    this.game_data.has_game_started = true;
                    this.game_data.current_midi_time = 0;
                    log_message(`[GameState] Game started via handle_keyboard_input (long tile)`);
                }

                this.update_midi_playback_for_row(active_row);

                if (active_row.row_type !== RowType.StartingTileRow && !active_row.is_completed) {
                    this.play_tile_sound();
                }
                return true;
            } else {
                this.press_tile(pressed_rect, active_row, pressed_rect.y + this.game_data.scroll_offset);
                return true;
            }
        } else if (!pressed_rect) {
            const column_width = SCREEN_CONFIG.WIDTH / 4;
            const screen_x = lane_index * column_width + column_width / 2;
            const screen_y = active_row.y_position + this.game_data.scroll_offset + active_row.height / 2;
            this.trigger_game_over_misclicked(lane_index, screen_x, screen_y, active_row);
            return false;
        }

        return false;
    }

    private complete_tile(rect: TileData, row: RowData, screen_y: number, early_release: boolean): void {
        rect.is_pressed = true;
        rect.completed_at = performance.now();

        if (row.row_type !== RowType.StartingTileRow && !this.game_data.has_game_started) {
            this.game_data.has_game_started = true;
            this.game_data.current_midi_time = 0;
            log_message(`[GameState] Game started via complete_tile (fallback for long tile)`);
        }

        if (!early_release) {
            rect.opacity = 1.0;
            this.particle_system.add_debris(rect.x, screen_y, rect.width, rect.height, 20);
        } else {
            log_message(`[GameState] Long tile released early, skipping notes for row ${row.row_index}`);
            this.skip_notes_for_active_row();
        }

        if (row.row_type !== RowType.StartingTileRow) {
            this.score_manager.add_tile_score(rect, row, performance.now());
        }

        this.check_row_completion(row);
    }

    private press_tile(rect: TileData, row: RowData, screen_y: number): void {
        this.check_and_update_music_for_row(row);

        if (row.row_type !== RowType.StartingTileRow && !this.game_data.has_game_started) {
            this.game_data.has_game_started = true;
            this.game_data.current_midi_time = 0;
            log_message(`[GameState] Game started via press_tile (normal tile)`);
        }

        this.update_midi_playback_for_row(row);

        if (row.row_type !== RowType.StartingTileRow && !row.is_completed) {
            this.play_tile_sound();
        }
        this.complete_tile(rect, row, screen_y, false);
    }

    private check_row_completion(row: RowData): void {
        if (row.row_type === RowType.EmptyRow) {
            row.is_completed = true;
            return;
        }

        const all_pressed = row.tiles.every(r => r.is_pressed);
        if (all_pressed) {
            row.is_completed = true;
            row.is_active = false;
            this.game_data.completed_rows_count++;
            this.game_data.total_completed_height += row.height;

            const next_row = this.find_next_incomplete_row(row.row_index);
            if (next_row) {
                const old_index = this.game_data.active_row_index;
                this.game_data.active_row_index = next_row.row_index;
                this.game_data.current_dt_press_count = 0;

                for (let i = old_index + 1; i < next_row.row_index; i++) {
                    const middle_row = this.game_data.rows[i];
                    if (middle_row && middle_row.row_type === RowType.EmptyRow) {
                        this.update_midi_playback_for_row(middle_row);
                    }
                }
            }
        }
    }

    private update_midi_playback_for_row(row: RowData): void {
        const level_row_index = row.row_index - 1;
        if (level_row_index < 0) return;

        const timing = this.game_data.level_row_timings[level_row_index];
        if (!timing) return;

        const is_manual_interaction = row.row_type !== RowType.EmptyRow;
        const is_first_interaction_of_row =
            row.row_type !== RowType.DoubleTileRow || this.game_data.current_dt_press_count === 0;

        if (
            is_manual_interaction &&
            is_first_interaction_of_row &&
            this.game_data.current_midi_time < timing.start_time
        ) {
            log_message(
                `[GameState] Jumping stopwatch to next timing point: ${this.game_data.current_midi_time.toFixed(3)}s -> ${timing.start_time.toFixed(3)}s`,
            );
            this.game_data.current_midi_time = timing.start_time;
        }

        this.game_data.current_dt_press_count++;
        if (row.row_type === RowType.DoubleTileRow) {
            if (this.game_data.current_dt_press_count === 1) {
                this.game_data.target_time_for_next_note = timing.mid_time;
            } else {
                this.game_data.target_time_for_next_note = timing.end_time;
            }
        } else {
            this.game_data.target_time_for_next_note = timing.end_time;
        }

        this.game_data.midi_playing = true;

        if (this.game_data.midi_loaded) {
            const played_note_ids = this.audio_manager.update_midi_playback(
                this.game_data.current_midi_time,
                this.game_data.skipped_midi_notes,
            );
            this.spawn_note_hit_animations(played_note_ids);
        }
    }

    private skip_notes_for_active_row(): void {
        const active_row = this.get_active_row();
        if (!active_row) return;

        const indicators = this.game_data.note_indicators.filter(
            ind => ind.row_index === active_row.row_index && !ind.is_consumed,
        );
        for (const ind of indicators) {
            this.game_data.skipped_midi_notes.push(ind.note_id);
            ind.is_consumed = true;
        }
    }

    private find_next_incomplete_row(current_index: number): RowData | null {
        for (let i = current_index + 1; i < this.game_data.rows.length; i++) {
            const row = this.game_data.rows[i];
            if (row && !row.is_completed) {
                return row;
            }
        }
        return null;
    }

    private trigger_game_over_misclicked(
        lane_index: number,
        _screen_x: number,
        _screen_y: number,
        active_row: RowData,
    ): void {
        this.game_data.state = GameState.TileMisclicked;

        this.audio_manager.play_game_over_chord();

        const column_width = SCREEN_CONFIG.WIDTH / 4;
        const indicator: TileData = {
            lane_index,
            x: lane_index * column_width,
            y: active_row.y_position,
            width: column_width,
            height: active_row.height,
            color: Color.Red,
            opacity: 1.0,
            is_pressed: false,
            is_game_over_indicator: true,
            flash_state: true,
            is_holding: false,
            progress: 0,
            is_released_early: false,
            completed_at: null,
            last_note_played_at: null,
            active_circle_animations: [],
        };

        this.game_data.game_over_data = {
            tile: indicator,
            start_time: performance.now(),
            flash_count: 0,
            is_flashing: true,
        };
    }

    private trigger_game_over_out_of_bounds(active_row: RowData): void {
        this.game_data.state = GameState.TileFellOffScreen;

        this.audio_manager.play_game_over_chord();

        const unpressed_rect = active_row.tiles.find(r => !r.is_pressed);
        if (unpressed_rect) {
            this.game_data.game_over_data = {
                tile: unpressed_rect,
                start_time: performance.now(),
                flash_count: 0,
                is_flashing: true,
            };
        }

        const target_offset = this.calculate_reposition_offset();
        this.game_data.game_over_animation = {
            start_time: performance.now(),
            duration: 500,
            start_offset: this.game_data.scroll_offset,
            target_offset: target_offset,
            is_animating: true,
        };
    }

    private calculate_reposition_offset(): number {
        const active_row = this.get_active_row();

        if (!active_row) {
            return this.game_data.scroll_offset;
        }

        const active_row_height = active_row.height;
        const base_row_height = SCREEN_CONFIG.BASE_ROW_HEIGHT;

        return SCREEN_CONFIG.HEIGHT - base_row_height - active_row_height - active_row.y_position;
    }

    private trigger_game_won(): void {
        if (this.game_data.state !== GameState.Cleared) {
            this.game_data.state = GameState.Cleared;
            this.game_data.game_won_time = performance.now();
        }
    }

    update_game_over_flash(current_time: number): void {
        const flash_state = this.game_data.game_over_data;
        if (!flash_state || !flash_state.is_flashing) {
            return;
        }

        const elapsed = current_time - flash_state.start_time;
        const flash_interval = 125;
        const total_duration = 1000;

        if (elapsed >= total_duration) {
            flash_state.is_flashing = false;
            flash_state.tile.flash_state = false;
            return;
        }

        const flash_count = Math.floor(elapsed / flash_interval);
        flash_state.flash_count = flash_count;
        flash_state.tile.flash_state = flash_count % 2 === 0;
    }

    update_game_over_animation(current_time: number): void {
        const animation = this.game_data.game_over_animation;
        if (!animation || !animation.is_animating) {
            return;
        }

        const elapsed = current_time - animation.start_time;
        const progress = Math.min(elapsed / animation.duration, 1.0);

        const eased_progress = 1 - Math.pow(1 - progress, 3);

        const new_offset = animation.start_offset + (animation.target_offset - animation.start_offset) * eased_progress;

        this.game_data.scroll_offset = new_offset;

        if (progress >= 1.0) {
            animation.is_animating = false;
        }
    }

    update_game_won(current_time: number): void {
        if (this.game_data.state === GameState.Cleared && this.game_data.game_won_time !== null) {
            if (current_time - this.game_data.game_won_time >= 1000) {
                this.reset();
            }
        }
    }

    update_particles(delta_time: number): void {
        this.particle_system.update(delta_time);
    }

    get_visible_rows(): RowData[] {
        const visible_rows: RowData[] = [];
        const start_idx = Math.max(0, this.game_data.active_row_index - 50);
        for (let i = start_idx; i < this.game_data.rows.length; i++) {
            const row = this.game_data.rows[i];
            if (!row) continue;

            if (is_row_visible(row, this.game_data.scroll_offset)) {
                visible_rows.push(row);
            }

            const row_bottom_screen_y = row.y_position + this.game_data.scroll_offset + row.height;
            if (row_bottom_screen_y < 0) {
                break;
            }
        }
        return visible_rows;
    }

    get_config(): GameConfig {
        return this.config;
    }

    get_game_over_tile(): TileData | null {
        if (this.game_data.game_over_data) {
            return this.game_data.game_over_data.tile;
        }
        return null;
    }

    get_active_note_indicators(): NoteIndicatorData[] {
        return get_active_indicators(this.game_data.note_indicators);
    }

    get_score_data(): ScoreData {
        const data = this.score_manager.get_score_data();
        if (this.game_data.game_mode === GameMode.Survival) {
            return {
                ...data,
                animation: {
                    ...data.animation,
                    current_scale: 1.0,
                },
                override_display_text: this.game_data.current_tps.toFixed(3),
            };
        }
        return data;
    }

    private spawn_note_hit_animations(played_note_ids: number[]): void {
        if (played_note_ids.length === 0) return;

        const current_time = performance.now();
        const note_id_to_indicator = new Map<number, NoteIndicatorData>();
        for (const ind of this.game_data.note_indicators) {
            note_id_to_indicator.set(ind.note_id, ind);
        }

        const processed_hits = new Set<string>();
        for (const note_id of played_note_ids) {
            const indicator = note_id_to_indicator.get(note_id);
            if (indicator) {
                indicator.is_consumed = true;

                const hit_key = `${indicator.row_index}_${indicator.time}`;
                if (!processed_hits.has(hit_key)) {
                    processed_hits.add(hit_key);
                    const target_row = this.game_data.rows[indicator.row_index];
                    if (target_row) {
                        for (const tile of target_row.tiles) {
                            if (tile.is_holding) {
                                tile.last_note_played_at = current_time;
                                tile.active_circle_animations.push(current_time);
                            }
                        }
                    }
                }
            }
        }
    }

    update_score(current_time: number): void {
        this.score_manager.update(current_time);
    }
}
