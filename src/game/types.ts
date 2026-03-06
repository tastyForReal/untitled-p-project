export const SCREEN_CONFIG = {
    WIDTH: 405,
    HEIGHT: 720,
    COLUMN_COUNT: 4,
    BASE_ROW_HEIGHT: 180,
    SCROLL_SPEED: 540,
    GRID_LINE_WIDTH: 1,
    DEFAULT_TPS: 3,
} as const;

export const COLORS = {
    BLACK: '#000000',
    YELLOW: '#FFFF00',
    RED: '#FF0000',
    WHITE: '#FFFFFF',
} as const;

export enum RowType {
    SINGLE = 0,
    DOUBLE = 1,
    EMPTY = 2,
    START = 3,
}

export interface TileData {
    lane_index: number;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
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
    color: string;
}

export enum GameState {
    PAUSED = 0,
    PLAYING = 1,
    GAME_OVER_MISCLICKED = 2,
    GAME_OVER_OUT_OF_BOUNDS = 3,
    FLASHING = 4,
    GAME_WON = 5,
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
}

export interface RowTiming {
    start_time: number;
    mid_time: number;
    end_time: number;
}

export interface NoteIndicatorData {
    note_id: number;
    row_index: number;
    x: number;
    y: number;
    width: number;
    height: number;
    time: number;
    is_consumed: boolean;
}

export interface MusicMetadata {
    id: number;
    tps: number;
    start_row_index: number;
    end_row_index: number;
    row_count: number;
}

export enum InputType {
    MOUSE_CLICK = 0,
    KEYBOARD = 1,
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
