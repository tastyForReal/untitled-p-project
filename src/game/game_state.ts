import {
    GameData,
    GameState,
    RowData,
    RowType,
    RectangleData,
    SCREEN_CONFIG,
    COLORS,
    NoteIndicatorData,
} from "./types.js";
import { generate_all_rows, is_row_visible, DEFAULT_ROW_COUNT, create_rectangle } from "./row_generator.js";
import { ParticleSystem } from "./particle_system.js";
import { point_in_rect } from "../utils/math_utils.js";
import { RowTypeResult, LevelData } from "./json_level_reader.js";
import { get_audio_manager, AudioManager } from "./audio_manager.js";
import { build_note_indicators, consume_indicator_by_note_id, get_active_indicators } from "./note_indicator.js";

export interface GameConfig {
    row_count: number;
    is_bot_active: boolean;
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
    row_count: DEFAULT_ROW_COUNT,
    is_bot_active: false,
};

export function create_initial_game_state(config: GameConfig = DEFAULT_GAME_CONFIG): GameData {
    const rows = generate_all_rows(config.row_count);

    return {
        state: GameState.PAUSED,
        rows,
        particles: [],
        total_completed_height: 0,
        scroll_offset: 0,
        game_over_flash: null,
        game_over_animation: null,
        game_won_time: null,
        last_single_slot: 0,
        last_double_slots: null,
        active_row_index: 0,
        completed_rows_count: 0,
        // TPS defaults
        current_tps: SCREEN_CONFIG.DEFAULT_TPS,
        current_music_index: 0,
        musics_metadata: [],
        // MIDI playback defaults
        playback_stopwatch: 0,
        is_midi_loaded: false,
        has_game_started: false,
        note_indicators: [],
    };
}

/**
 * Determines the occupied columns for a double row based on the preceding row type.
 * Ensures the generated pattern maintains reachable paths for the player without awkward cross-screen jumps.
 */
function determine_double_slots(preceding_row: RowData | null): [number, number] {
    if (preceding_row === null) {
        return Math.random() < 0.5 ? [0, 2] : [1, 3];
    }

    if (preceding_row.row_type === RowType.SINGLE || preceding_row.row_type === RowType.START) {
        const single_slot = preceding_row.rectangles[0]?.slot_index;
        if (single_slot === undefined) {
            return Math.random() < 0.5 ? [0, 2] : [1, 3];
        }

        if (single_slot === 0 || single_slot === 2) {
            return [1, 3];
        } else {
            return [0, 2];
        }
    }

    if (preceding_row.row_type === RowType.DOUBLE) {
        const occupied_slots = preceding_row.rectangles.map(r => r.slot_index);

        if (occupied_slots.includes(0) && occupied_slots.includes(2)) {
            return [1, 3];
        } else {
            return [0, 2];
        }
    }

    return Math.random() < 0.5 ? [0, 2] : [1, 3];
}

/**
 * Generates rows from RowTypeResult array (from level loader)
 */
export function generate_rows_from_level_data(level_rows: RowTypeResult[]): RowData[] {
    const rows: RowData[] = [];

    // Create start row first
    const start_y = SCREEN_CONFIG.HEIGHT - SCREEN_CONFIG.BASE_ROW_HEIGHT * 2;
    const start_slot = Math.floor(Math.random() * 4);
    const start_rectangle = create_rectangle(start_slot, start_y, SCREEN_CONFIG.BASE_ROW_HEIGHT, COLORS.YELLOW, 1.0);

    rows.push({
        row_index: 0,
        row_type: RowType.START,
        height_multiplier: 1,
        y_position: start_y,
        height: SCREEN_CONFIG.BASE_ROW_HEIGHT,
        rectangles: [start_rectangle],
        is_completed: false,
        is_active: true,
    });

    let current_y = start_y;
    let last_single_slot = start_slot;

    for (let i = 0; i < level_rows.length; i++) {
        const row_data = level_rows[i];
        if (!row_data) continue;
        const row_height = row_data.height_multiplier * SCREEN_CONFIG.BASE_ROW_HEIGHT;
        current_y -= row_height;

        const row_index = i + 1; // +1 because start row is index 0
        const preceding_row = rows[rows.length - 1]; // Get the last added row
        let rectangles: RectangleData[] = [];

        if (row_data.type === RowType.SINGLE) {
            let slot: number;

            // If preceded by a double, choose from the empty slots (gaps)
            if (preceding_row && preceding_row.row_type === RowType.DOUBLE) {
                const occupied = preceding_row.rectangles.map(r => r.slot_index);
                const empty_slots = [0, 1, 2, 3].filter(s => !occupied.includes(s));
                const chosen_slot = empty_slots[Math.floor(Math.random() * empty_slots.length)];
                slot = chosen_slot ?? 0;
            } else {
                // Otherwise, choose any slot except the last single slot
                const available_slots = [0, 1, 2, 3].filter(s => s !== last_single_slot);
                const chosen_slot = available_slots[Math.floor(Math.random() * available_slots.length)];
                slot = chosen_slot ?? 0;
            }

            rectangles = [create_rectangle(slot, current_y, row_height, COLORS.BLACK, 1.0)];
            last_single_slot = slot;
        } else if (row_data.type === RowType.DOUBLE) {
            // Use preceding row to determine slots
            const slots = determine_double_slots(preceding_row ?? null);
            rectangles = slots.map(slot => create_rectangle(slot, current_y, row_height, COLORS.BLACK, 1.0));
        }
        // EMPTY rows have no rectangles

        rows.push({
            row_index: row_index,
            row_type: row_data.type,
            height_multiplier: row_data.height_multiplier,
            y_position: current_y,
            height: row_height,
            rectangles,
            is_completed: row_data.type === RowType.EMPTY,
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

    constructor(config: GameConfig = DEFAULT_GAME_CONFIG) {
        this.config = config;
        this.game_data = create_initial_game_state(config);
        this.particle_system = new ParticleSystem();
        this.audio_manager = get_audio_manager();
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
        // Clear MIDI data and reset playback
        this.audio_manager.clear_midi_data();
    }

    /**
     * Loads a complete level with rows and music metadata for dynamic TPS
     */
    load_level(level_data: LevelData): void {
        const rows = generate_rows_from_level_data(level_data.rows);

        // Determine initial TPS from first music
        const initial_tps =
            level_data.musics.length > 0
                ? (level_data.musics[0]?.tps ?? SCREEN_CONFIG.DEFAULT_TPS)
                : SCREEN_CONFIG.DEFAULT_TPS;

        // Load MIDI data to audio manager if available
        const is_midi_loaded = level_data.midi_json !== null;
        console.log(`[GameState] Loading level:`);
        console.log(`  - Total rows: ${rows.length}`);
        console.log(`  - Music sections: ${level_data.musics.length}`);
        console.log(`  - Base BPM: ${level_data.base_bpm}`);
        console.log(`  - Initial TPS: ${initial_tps.toFixed(2)}`);
        console.log(`  - MIDI loaded: ${is_midi_loaded}`);

        if (level_data.midi_json) {
            console.log(`  - MIDI tracks: ${level_data.midi_json.tracks.length}`);
            this.audio_manager.load_midi_data(level_data.midi_json);
        } else {
            console.log(`  - No MIDI data, clearing audio manager`);
            this.audio_manager.clear_midi_data();
        }

        this.game_data = {
            state: GameState.PAUSED,
            rows,
            particles: [],
            total_completed_height: 0,
            scroll_offset: 0,
            game_over_flash: null,
            game_over_animation: null,
            game_won_time: null,
            last_single_slot: 0,
            last_double_slots: null,
            active_row_index: 0,
            completed_rows_count: 0,
            // TPS settings from level data
            current_tps: initial_tps,
            current_music_index: 0,
            musics_metadata: level_data.musics,
            // MIDI playback settings
            playback_stopwatch: 0,
            is_midi_loaded,
            has_game_started: false,
            note_indicators: [],
        };

        // Build note indicators from MIDI data after rows are set
        if (level_data.midi_json) {
            this.game_data.note_indicators = build_note_indicators(
                level_data.midi_json,
                this.game_data.rows,
                level_data.musics,
            );
            console.log(`[GameState] Built ${this.game_data.note_indicators.length} note indicators`);
        }
        this.particle_system.clear();
    }

    /**
     * Loads custom rows from level data (backward compatibility)
     */
    load_custom_rows(level_rows: RowTypeResult[]): void {
        const rows = generate_rows_from_level_data(level_rows);
        this.game_data = {
            state: GameState.PAUSED,
            rows,
            particles: [],
            total_completed_height: 0,
            scroll_offset: 0,
            game_over_flash: null,
            game_over_animation: null,
            game_won_time: null,
            last_single_slot: 0,
            last_double_slots: null,
            active_row_index: 0,
            completed_rows_count: 0,
            // Default TPS when no metadata
            current_tps: SCREEN_CONFIG.DEFAULT_TPS,
            current_music_index: 0,
            musics_metadata: [],
            // MIDI playback defaults
            playback_stopwatch: 0,
            is_midi_loaded: false,
            has_game_started: false,
            note_indicators: [],
        };
        this.particle_system.clear();
        // Clear MIDI data when loading custom rows
        this.audio_manager.clear_midi_data();
    }

    start(): void {
        if (this.game_data.state === GameState.PAUSED) {
            this.game_data.state = GameState.PLAYING;
        }
    }

    toggle_pause(): void {
        if (this.config.is_bot_active) return;

        if (this.game_data.state === GameState.PLAYING) {
            this.game_data.state = GameState.PAUSED;
        } else if (this.game_data.state === GameState.PAUSED) {
            this.game_data.state = GameState.PLAYING;
        }
    }

    is_paused(): boolean {
        return (
            this.game_data.state === GameState.PAUSED ||
            this.game_data.state === GameState.GAME_OVER_MISCLICKED ||
            this.game_data.state === GameState.GAME_OVER_OUT_OF_BOUNDS ||
            this.game_data.state === GameState.GAME_WON
        );
    }

    is_game_over(): boolean {
        return (
            this.game_data.state === GameState.GAME_OVER_MISCLICKED ||
            this.game_data.state === GameState.GAME_OVER_OUT_OF_BOUNDS ||
            this.game_data.state === GameState.GAME_WON
        );
    }

    /**
     * Calculates the current scroll speed based on TPS.
     * TPS = tiles per second, where each tile is BASE_ROW_HEIGHT pixels.
     * Scroll speed = TPS * BASE_ROW_HEIGHT (pixels per second)
     */
    private get_scroll_speed(): number {
        return this.game_data.current_tps * SCREEN_CONFIG.BASE_ROW_HEIGHT;
    }

    /**
     * Updates the current TPS based on which music section the active row belongs to.
     * This is called during scroll updates to handle dynamic tempo changes.
     */
    private update_current_music(): void {
        const musics = this.game_data.musics_metadata;
        if (musics.length === 0) return;

        const active_row = this.get_active_row();
        if (!active_row || active_row.row_type === RowType.START) return;

        // Row index 0 is the start row, so actual level rows start at index 1
        // Convert to level row index (0-based for level rows)
        const level_row_index = active_row.row_index - 1;

        // Find which music section this row belongs to
        for (let i = 0; i < musics.length; i++) {
            const music = musics[i];
            if (!music) continue;
            // start_row_index and end_row_index are already 0-based for level rows
            if (level_row_index >= music.start_row_index && level_row_index < music.end_row_index) {
                if (this.game_data.current_music_index !== i) {
                    // Transitioned to a new music section
                    const previous_music_index = this.game_data.current_music_index;
                    const previous_tps = this.game_data.current_tps;
                    this.game_data.current_music_index = i;
                    this.game_data.current_tps = music.tps;
                    console.log(`[GameState] Music transition detected:`);
                    console.log(`  - From: Music ${previous_music_index}, TPS: ${previous_tps.toFixed(2)}`);
                    console.log(`  - To: Music ${music.id} (index ${i}), TPS: ${music.tps.toFixed(2)}`);
                    console.log(
                        `  - Level row index: ${level_row_index}, range: [${music.start_row_index}, ${music.end_row_index})`,
                    );
                }
                break;
            }
        }
    }

    update_scroll(delta_time: number): void {
        if (this.is_paused() || this.is_game_over()) {
            return;
        }

        // Update TPS based on current music section
        this.update_current_music();

        const scroll_speed = this.get_scroll_speed();
        const scroll_delta = scroll_speed * delta_time;
        this.game_data.scroll_offset += scroll_delta;

        // Only update playback stopwatch and MIDI playback after game has started (first black tile pressed)
        if (this.game_data.has_game_started) {
            // Update playback stopwatch (in seconds)
            const previous_stopwatch = this.game_data.playback_stopwatch;
            this.game_data.playback_stopwatch += delta_time;

            // Update MIDI playback and consume note indicators
            if (this.game_data.is_midi_loaded) {
                const played_note_ids = this.audio_manager.update_midi_playback(this.game_data.playback_stopwatch);
                for (const note_id of played_note_ids) {
                    consume_indicator_by_note_id(this.game_data.note_indicators, note_id);
                }
            }

            // Log stopwatch update every 0.5 seconds
            if (Math.floor(this.game_data.playback_stopwatch * 2) !== Math.floor(previous_stopwatch * 2)) {
                console.log(
                    `[GameState] Stopwatch: ${this.game_data.playback_stopwatch.toFixed(3)}s, MIDI loaded: ${this.game_data.is_midi_loaded}`,
                );
            }
        }

        const active_row = this.get_active_row();
        if (active_row) {
            for (const rect of active_row.rectangles) {
                if (rect.is_holding && !rect.is_pressed) {
                    rect.progress += scroll_delta;
                    if (rect.progress >= rect.height) {
                        rect.progress = rect.height;
                        rect.is_holding = false;
                        this.complete_rectangle(rect, active_row, rect.y + this.game_data.scroll_offset, false);
                    }
                }
            }
        }

        this.update_active_row();
    }

    update_bot(): void {
        if (!this.config.is_bot_active || this.is_game_over()) {
            return;
        }

        const active_row = this.get_active_row();
        if (!active_row) return;

        if (active_row.row_type === RowType.START) {
            return;
        }

        const row_top = active_row.y_position + this.game_data.scroll_offset;
        const row_bottom = row_top + active_row.height;
        const trigger_y = SCREEN_CONFIG.HEIGHT / 2;

        const is_long_tile = active_row.height > SCREEN_CONFIG.BASE_ROW_HEIGHT;

        if (is_long_tile) {
            const long_tile_trigger = row_bottom - SCREEN_CONFIG.BASE_ROW_HEIGHT;
            console.log(
                `[GameState] Bot: Long tile check - row_bottom: ${row_bottom.toFixed(1)}, trigger: ${trigger_y.toFixed(1)}, threshold: ${long_tile_trigger.toFixed(1)}`,
            );
            if (long_tile_trigger >= trigger_y) {
                for (const rect of active_row.rectangles) {
                    if (!rect.is_pressed && !rect.is_holding) {
                        rect.is_holding = true;
                        // Start progress bar from base tile height for long tiles
                        rect.progress = SCREEN_CONFIG.BASE_ROW_HEIGHT;
                        // Start the game stopwatch when the first black tile is pressed
                        if (!this.game_data.has_game_started) {
                            this.game_data.has_game_started = true;
                            console.log(`[GameState] Game started via bot (long tile)`);
                        }
                        // Play sound when bot starts holding a long tile
                        this.play_tile_sound();
                    }
                }
            }
        } else {
            if (row_top >= trigger_y) {
                for (const rect of active_row.rectangles) {
                    if (!rect.is_pressed) {
                        // Use press_rectangle to play sound
                        this.press_rectangle(rect, active_row, rect.y + this.game_data.scroll_offset);
                    }
                }
            }
        }
    }

    /**
     * Re-evaluates which row is currently "active" (i.e. the lowest, uncompleted visible row).
     * Triggers the out-of-bounds GAME OVER if an uncompleted row falls completely off the visible screen
     * (meaning its Y coordinate plus the global scroll offset exceeds the screen height).
     */
    private update_active_row(): void {
        const current_active_row = this.get_active_row();
        if (current_active_row && current_active_row.row_type !== RowType.START) {
            const screen_y = current_active_row.y_position + this.game_data.scroll_offset;
            if (screen_y > SCREEN_CONFIG.HEIGHT) {
                if (!current_active_row.is_completed) {
                    this.trigger_game_over_out_of_bounds(current_active_row);
                    return;
                }
            }
        }

        const has_incomplete = this.game_data.rows.some(r => !r.is_completed);
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

        const visible_incomplete_rows = this.game_data.rows.filter(row => {
            return !row.is_completed && is_row_visible(row, this.game_data.scroll_offset);
        });

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

    /**
     * Plays the appropriate sound for a tile press.
     * If MIDI data is loaded, uses MIDI playback. Otherwise, plays random sample.
     */
    private play_tile_sound(): void {
        // If MIDI data is loaded, don't play random samples
        // The MIDI playback is handled in update_scroll
        if (!this.game_data.is_midi_loaded) {
            this.audio_manager.play_random_sample();
        }
    }

    handle_slot_input(slot_index: number, screen_x: number, screen_y: number, is_down: boolean): boolean {
        if (this.is_game_over()) {
            return false;
        }

        const start_row = this.game_data.rows.find(r => r.row_type === RowType.START);

        if (is_down && this.game_data.state === GameState.PAUSED && start_row && !start_row.is_completed) {
            const start_rect = start_row.rectangles[0];
            if (start_rect) {
                const start_screen_y = start_rect.y + this.game_data.scroll_offset;
                if (
                    point_in_rect(screen_x, screen_y, start_rect.x, start_screen_y, start_rect.width, start_rect.height)
                ) {
                    this.press_rectangle(start_rect, start_row, start_screen_y);
                    this.game_data.state = GameState.PLAYING;
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
        const pressed_rect = active_row.rectangles.find(r => r.slot_index === slot_index);

        if (this.config.is_bot_active) {
            if (is_down) {
                if (!pressed_rect && screen_y >= row_top && screen_y <= row_bottom) {
                    this.trigger_game_over_misclicked(slot_index, screen_x, screen_y, active_row);
                }
            }
            return false;
        }

        if (!is_down) {
            if (pressed_rect && pressed_rect.is_holding && !pressed_rect.is_pressed) {
                pressed_rect.is_holding = false;
                if (pressed_rect.progress < pressed_rect.height) {
                    pressed_rect.is_released_early = true;
                    this.complete_rectangle(
                        pressed_rect,
                        active_row,
                        pressed_rect.y + this.game_data.scroll_offset,
                        true,
                    );
                }
            }
            return false;
        }

        if (pressed_rect && !pressed_rect.is_pressed && !pressed_rect.is_holding) {
            const is_long_tile = active_row.height > SCREEN_CONFIG.BASE_ROW_HEIGHT;
            console.log(`[GameState] handle_slot_input: Tile press detected`);
            console.log(`  - Slot index: ${slot_index}, Is long tile: ${is_long_tile}`);
            console.log(`  - Row height: ${active_row.height}, Base height: ${SCREEN_CONFIG.BASE_ROW_HEIGHT}`);

            if (is_long_tile) {
                const hit_zone_top = row_bottom - SCREEN_CONFIG.BASE_ROW_HEIGHT;
                console.log(
                    `  - Screen Y: ${screen_y.toFixed(1)}, Hit zone: [${hit_zone_top.toFixed(1)}, ${row_bottom.toFixed(1)}]`,
                );
                console.log(`  - In hit zone: ${screen_y >= hit_zone_top && screen_y <= row_bottom}`);

                if (screen_y >= hit_zone_top && screen_y <= row_bottom) {
                    pressed_rect.is_holding = true;
                    // Start progress bar from base tile height for long tiles
                    pressed_rect.progress = SCREEN_CONFIG.BASE_ROW_HEIGHT;
                    // Start the game stopwatch when the first black tile is pressed
                    if (!this.game_data.has_game_started) {
                        this.game_data.has_game_started = true;
                        console.log(`[GameState] Game started via handle_slot_input (long tile in hit zone)`);
                        console.log(`  - Row index: ${active_row.row_index}`);
                        console.log(`  - MIDI loaded: ${this.game_data.is_midi_loaded}`);
                    }
                    // Play sound for long black tiles
                    if (active_row.row_type !== RowType.START && !active_row.is_completed) {
                        this.play_tile_sound();
                    }
                } else {
                    console.log(`[GameState] Long tile press OUTSIDE hit zone - game NOT started`);
                }
                return true;
            } else {
                this.press_rectangle(pressed_rect, active_row, pressed_rect.y + this.game_data.scroll_offset);
                return true;
            }
        } else if (!pressed_rect && screen_y >= row_top && screen_y <= row_bottom) {
            this.trigger_game_over_misclicked(slot_index, screen_x, screen_y, active_row);
            return false;
        }

        return false;
    }

    handle_keyboard_input(slot_index: number, is_down: boolean): boolean {
        if (this.is_game_over()) {
            return false;
        }

        const active_row = this.get_active_row();
        if (!active_row) {
            return false;
        }

        const row_bottom = active_row.y_position + this.game_data.scroll_offset + active_row.height;
        const timing_zone = SCREEN_CONFIG.HEIGHT / 2;

        const pressed_rect = active_row.rectangles.find(r => r.slot_index === slot_index);

        if (this.config.is_bot_active) {
            if (is_down) {
                if (!pressed_rect && row_bottom >= timing_zone) {
                    const column_width = SCREEN_CONFIG.WIDTH / 4;
                    const screen_x = slot_index * column_width + column_width / 2;
                    const screen_y = active_row.y_position + this.game_data.scroll_offset + active_row.height / 2;
                    this.trigger_game_over_misclicked(slot_index, screen_x, screen_y, active_row);
                }
            }
            return false;
        }

        if (!is_down) {
            if (pressed_rect && pressed_rect.is_holding && !pressed_rect.is_pressed) {
                pressed_rect.is_holding = false;
                if (pressed_rect.progress < pressed_rect.height) {
                    pressed_rect.is_released_early = true;
                    this.complete_rectangle(
                        pressed_rect,
                        active_row,
                        pressed_rect.y + this.game_data.scroll_offset,
                        true,
                    );
                }
            }
            return false;
        }

        if (row_bottom < timing_zone) {
            return false;
        }

        if (pressed_rect && !pressed_rect.is_pressed && !pressed_rect.is_holding) {
            const is_long_tile = active_row.height > SCREEN_CONFIG.BASE_ROW_HEIGHT;
            console.log(`[GameState] handle_keyboard_input: Tile press detected`);
            console.log(`  - Slot index: ${slot_index}, Is long tile: ${is_long_tile}`);
            console.log(`  - Row height: ${active_row.height}, Base height: ${SCREEN_CONFIG.BASE_ROW_HEIGHT}`);
            console.log(`  - Row bottom: ${row_bottom.toFixed(1)}, Timing zone: ${timing_zone.toFixed(1)}`);

            if (is_long_tile) {
                pressed_rect.is_holding = true;
                // Start progress bar from base tile height for long tiles
                pressed_rect.progress = SCREEN_CONFIG.BASE_ROW_HEIGHT;
                // Start the game stopwatch when the first black tile is pressed
                if (!this.game_data.has_game_started) {
                    this.game_data.has_game_started = true;
                    console.log(`[GameState] Game started via handle_keyboard_input (long tile)`);
                    console.log(`  - Row index: ${active_row.row_index}`);
                    console.log(`  - MIDI loaded: ${this.game_data.is_midi_loaded}`);
                }
                // Play sound for long black tiles
                if (active_row.row_type !== RowType.START && !active_row.is_completed) {
                    this.play_tile_sound();
                }
                return true;
            } else {
                this.press_rectangle(pressed_rect, active_row, pressed_rect.y + this.game_data.scroll_offset);
                return true;
            }
        } else if (!pressed_rect) {
            const column_width = SCREEN_CONFIG.WIDTH / 4;
            const screen_x = slot_index * column_width + column_width / 2;
            const screen_y = active_row.y_position + this.game_data.scroll_offset + active_row.height / 2;
            this.trigger_game_over_misclicked(slot_index, screen_x, screen_y, active_row);
            return false;
        }

        return false;
    }

    private complete_rectangle(rect: RectangleData, row: RowData, screen_y: number, early_release: boolean): void {
        rect.is_pressed = true;

        // Start the game stopwatch when the first black tile is pressed (fallback for long tiles)
        if (row.row_type !== RowType.START && !this.game_data.has_game_started) {
            this.game_data.has_game_started = true;
            console.log(`[GameState] Game started via complete_rectangle (fallback for long tile)`);
            console.log(`  - Row index: ${row.row_index}, Row type: ${RowType[row.row_type]}`);
            console.log(`  - Slot index: ${rect.slot_index}`);
            console.log(`  - Early release: ${early_release}`);
            console.log(`  - MIDI loaded: ${this.game_data.is_midi_loaded}`);
        }

        if (!early_release) {
            rect.opacity = 0.25;
            this.particle_system.add_debris(rect.x, screen_y, rect.width, rect.height, 20);
        }
        this.check_row_completion(row);
    }

    private press_rectangle(rect: RectangleData, row: RowData, screen_y: number): void {
        // Start the game stopwatch when the first black tile is pressed
        if (row.row_type !== RowType.START && !this.game_data.has_game_started) {
            this.game_data.has_game_started = true;
            console.log(`[GameState] Game started via press_rectangle (normal tile)`);
            console.log(`  - Row index: ${row.row_index}, Row type: ${RowType[row.row_type]}`);
            console.log(`  - Slot index: ${rect.slot_index}`);
            console.log(`  - MIDI loaded: ${this.game_data.is_midi_loaded}`);
            console.log(`  - Stopwatch started at: ${this.game_data.playback_stopwatch.toFixed(3)}s`);
        }

        // Play sound for black tiles
        if (row.row_type !== RowType.START && !row.is_completed) {
            this.play_tile_sound();
        }
        this.complete_rectangle(rect, row, screen_y, false);
    }

    private check_row_completion(row: RowData): void {
        if (row.row_type === RowType.EMPTY) {
            row.is_completed = true;
            return;
        }

        const all_pressed = row.rectangles.every(r => r.is_pressed);
        if (all_pressed) {
            row.is_completed = true;
            row.is_active = false;
            this.game_data.completed_rows_count++;
            this.game_data.total_completed_height += row.height;

            const next_row = this.find_next_incomplete_row(row.row_index);
            if (next_row) {
                this.game_data.active_row_index = next_row.row_index;
            }
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
        slot_index: number,
        _screen_x: number,
        _screen_y: number,
        active_row: RowData,
    ): void {
        this.game_data.state = GameState.GAME_OVER_MISCLICKED;

        // Play game over chord
        this.audio_manager.play_game_over_chord();

        const column_width = SCREEN_CONFIG.WIDTH / 4;
        const indicator: RectangleData = {
            slot_index,
            x: slot_index * column_width,
            y: active_row.y_position,
            width: column_width,
            height: active_row.height,
            color: COLORS.RED,
            opacity: 1.0,
            is_pressed: false,
            is_game_over_indicator: true,
            flash_state: true,
            is_holding: false,
            progress: 0,
            is_released_early: false,
        };

        this.game_data.game_over_flash = {
            rectangle: indicator,
            start_time: performance.now(),
            flash_count: 0,
            is_flashing: true,
        };
    }

    private trigger_game_over_out_of_bounds(active_row: RowData): void {
        this.game_data.state = GameState.GAME_OVER_OUT_OF_BOUNDS;

        // Play game over chord
        this.audio_manager.play_game_over_chord();

        const unpressed_rect = active_row.rectangles.find(r => !r.is_pressed);
        if (unpressed_rect) {
            this.game_data.game_over_flash = {
                rectangle: unpressed_rect,
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

    /**
     * Calculates the target scroll offset required to properly animate the rows
     * back up when they fall out of bounds, so the failed row lands cleanly above the bottom edge.
     */
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
        if (this.game_data.state !== GameState.GAME_WON) {
            this.game_data.state = GameState.GAME_WON;
            this.game_data.game_won_time = performance.now();
        }
    }

    update_game_over_flash(current_time: number): void {
        const flash_state = this.game_data.game_over_flash;
        if (!flash_state || !flash_state.is_flashing) {
            return;
        }

        const elapsed = current_time - flash_state.start_time;
        const flash_interval = 125;
        const total_duration = 1000;

        if (elapsed >= total_duration) {
            flash_state.is_flashing = false;
            flash_state.rectangle.flash_state = false;
            return;
        }

        const flash_count = Math.floor(elapsed / flash_interval);
        flash_state.flash_count = flash_count;
        flash_state.rectangle.flash_state = flash_count % 2 === 0;
    }

    update_game_over_animation(current_time: number): void {
        const animation = this.game_data.game_over_animation;
        if (!animation || !animation.is_animating) {
            return;
        }

        const elapsed = current_time - animation.start_time;
        const progress = Math.min(elapsed / animation.duration, 1.0);

        // Easing function for smoother scroll repositioning
        const eased_progress = 1 - Math.pow(1 - progress, 3);

        const new_offset = animation.start_offset + (animation.target_offset - animation.start_offset) * eased_progress;

        this.game_data.scroll_offset = new_offset;

        if (progress >= 1.0) {
            animation.is_animating = false;
        }
    }

    update_game_won(current_time: number): void {
        if (this.game_data.state === GameState.GAME_WON && this.game_data.game_won_time !== null) {
            if (current_time - this.game_data.game_won_time >= 1000) {
                this.reset();
            }
        }
    }

    update_particles(delta_time: number): void {
        this.particle_system.update(delta_time);
    }

    get_visible_rows(): RowData[] {
        return this.game_data.rows.filter(row => is_row_visible(row, this.game_data.scroll_offset));
    }

    get_game_over_indicator(): RectangleData | null {
        if (this.game_data.game_over_flash) {
            return this.game_data.game_over_flash.rectangle;
        }
        return null;
    }

    get_active_note_indicators(): NoteIndicatorData[] {
        return get_active_indicators(this.game_data.note_indicators);
    }
}
