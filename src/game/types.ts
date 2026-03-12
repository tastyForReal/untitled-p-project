import { MidiJson } from './midi_types.js';
import { Color } from '../graphics/color.js';

export const SCREEN_CONFIG = {
    WIDTH: 405,
    HEIGHT: 720,
    COLUMN_COUNT: 4,
    BASE_ROW_HEIGHT: 180,
    SCROLL_SPEED: 540,
    GRID_LINE_WIDTH: 1,
    DEFAULT_TPS: 3,
} as const;

export enum RowType {
    SingleTileRow = 0,
    DoubleTileRow = 1,
    EmptyRow = 2,
    StartingTileRow = 3,
}

export interface RowTypeResult {
    type: RowType;
    height_multiplier: number;
}

export interface TileData {
    lane_index: number;
    x: number;
    y: number;
    width: number;
    height: number;
    color: Color;
    opacity: number;
    is_pressed: boolean;
    is_game_over_indicator: boolean;
    flash_state: boolean;
    is_holding: boolean;
    progress: number;
    is_released_early: boolean;
    completed_at: number | null;
    last_note_played_at: number | null;
    active_circle_animations: number[];
}

export interface RowData {
    row_index: number;
    row_type: RowType;
    height_multiplier: number;
    y_position: number;
    height: number;
    tiles: TileData[];
    is_completed: boolean;
    is_active: boolean;
}

export interface ParticleData {
    x: number;
    y: number;
    velocity_x: number;
    velocity_y: number;
    size: number;
    opacity: number;
    decay_rate: number;
    color: Color;
}

export enum GameState {
    Paused = 0,
    Resumed = 1,
    TileMisclicked = 2,
    TileFellOffScreen = 3,
    Flashing = 4,
    Cleared = 5,
}

export enum GameMode {
    OneRound = 0,
    Endless = 1,
    Survival = 2,
}

export interface EndlessConfig {
    mode: GameMode;
    fixed_tps_values?: number[];
    starting_tps?: number;
    acceleration_rate?: number;
}

export interface GameOverFlashState {
    tile: TileData;
    start_time: number;
    flash_count: number;
    is_flashing: boolean;
}

export interface GameOverAnimationState {
    start_time: number;
    duration: number;
    start_offset: number;
    target_offset: number;
    is_animating: boolean;
}

export interface GameData {
    state: GameState;
    rows: RowData[];
    particles: ParticleData[];
    total_completed_height: number;
    scroll_offset: number;
    game_over_data: GameOverFlashState | null;
    game_over_animation: GameOverAnimationState | null;
    game_won_time: number | null;
    last_single_lane: number;
    last_double_lanes: [number, number] | null;
    active_row_index: number;
    completed_rows_count: number;
    current_tps: number;
    current_music_index: number;
    musics_metadata: MusicMetadata[];
    current_midi_time: number;
    midi_loaded: boolean;
    has_game_started: boolean;
    note_indicators: NoteIndicatorData[];
    midi_playing: boolean;
    target_time_for_next_note: number;
    current_dt_press_count: number;
    skipped_midi_notes: number[];
    level_row_timings: RowTiming[];
    game_mode: GameMode;
    endless_config: EndlessConfig | null;
    loop_count: number;
    current_filename: string;
    raw_level_rows: RowTypeResult[];
    loop_0_midi_notes: {
        track_idx: number;
        midi: number;
        original_time: number;
        row_index: number;
        time_fraction: number;
    }[];
}

export interface RowTiming {
    start_time: number;
    mid_time: number;
    end_time: number;
}

export interface LevelData {
    rows: RowTypeResult[];
    musics: MusicMetadata[];
    base_bpm: number;
    midi_json: MidiJson | null;
}

export interface NoteIndicatorData {
    note_id: number;
    row_index: number;
    x: number;
    y: number;
    width: number;
    height: number;
    time: number;
    time_fraction?: number;
    track_idx?: number;
    midi?: number;
    is_consumed: boolean;
}

export interface MusicMetadata {
    id: number;
    tps: number;
    bpm: number;
    base_beats: number;
    start_row_index: number;
    end_row_index: number;
    row_count: number;
}

export enum InputType {
    Mouse = 0,
    Keyboard = 1,
}

export interface InputEvent {
    type: InputType;
    lane_index: number;
    screen_x: number;
    screen_y: number;
    timestamp: number;
}

export const KEY_SLOT_MAP: Record<string, number> = {
    d: 0,
    D: 0,
    f: 1,
    F: 1,
    j: 2,
    J: 2,
    k: 3,
    K: 3,
};
