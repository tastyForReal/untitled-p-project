export const SCREEN_CONFIG = {
    WIDTH: 405,
    HEIGHT: 720,
    COLUMN_COUNT: 4,
    BASE_ROW_HEIGHT: 180,
    SCROLL_SPEED: 540, // Default scroll speed (pixels per second)
    GRID_LINE_WIDTH: 1,
    DEFAULT_TPS: 3, // Default tiles per second when no level is loaded
} as const;

export const COLORS = {
    BLACK: "#000000",
    YELLOW: "#FFFF00",
    RED: "#FF0000",
    WHITE: "#FFFFFF",
} as const;

export enum RowType {
    SINGLE = 0,
    DOUBLE = 1,
    EMPTY = 2,
    START = 3,
}

export interface TileData {
    slot_index: number;
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
    game_over_flash: GameOverFlashState | null;
    game_over_animation: GameOverAnimationState | null;
    game_won_time: number | null;
    last_single_slot: number;
    last_double_slots: [number, number] | null;
    active_row_index: number;
    completed_rows_count: number;
    // TPS (Tiles Per Second) related fields
    current_tps: number;
    current_music_index: number;
    musics_metadata: MusicMetadata[];
    // MIDI playback related fields
    current_midi_time: number; // Current playback position in seconds
    midi_loaded: boolean; // Whether MIDI data is loaded from JSON
    has_game_started: boolean; // Whether the first black tile has been pressed (after yellow start tile)
    note_indicators: NoteIndicatorData[]; // Red 16x16 MIDI note indicator squares
    midi_playing: boolean; // Whether the stopwatch is currently running for MIDI playback
    target_time_for_next_note: number; // The next time threshold to stop the stopwatch
    current_dt_press_count: number; // Number of presses in the current double-tile row
    skipped_midi_notes: number[]; // IDs of notes to skip (e.g., from early release of long tiles)
    level_row_timings: RowTiming[]; // Timings for each level row
}

/**
 * Timing information for a row
 */
export interface RowTiming {
    start_time: number;
    mid_time: number;
    end_time: number;
}

/**
 * Represents a single red 16x16 square that indicates when a MIDI note
 * will be played at a specific time on a tile.
 */
export interface NoteIndicatorData {
    /** Unique identifier derived from the MIDI note's time and number */
    note_id: number;
    /** The row index this indicator belongs to */
    row_index: number;
    /** X position (pixel space, between left and right edge of the tile) */
    x: number;
    /** Y position (pixel space, relative to the row's coordinate system) */
    y: number;
    /** Width of the indicator square */
    width: number;
    /** Height of the indicator square */
    height: number;
    /** The playback time (seconds) that this indicator corresponds to */
    time: number;
    /** Whether the indicator has been consumed (note was played) */
    is_consumed: boolean;
}

/**
 * Metadata for a music section within a level
 */
export interface MusicMetadata {
    id: number;
    tps: number; // Tiles per second
    start_row_index: number; // Index of first row in combined array (excluding start row)
    end_row_index: number; // Index after last row (exclusive)
    row_count: number; // Number of rows in this music
}

export enum InputType {
    MOUSE_CLICK = 0,
    KEYBOARD = 1,
}

export interface InputEvent {
    type: InputType;
    slot_index: number;
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
