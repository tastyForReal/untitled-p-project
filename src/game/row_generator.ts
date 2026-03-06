import { random_int } from '../utils/math_utils.js';
import { RowType, RowData, TileData, SCREEN_CONFIG, COLORS } from './types.js';

export const DEFAULT_ROW_COUNT = 100;

enum GeneratedRowType {
    SINGLE = 'single',
    DOUBLE = 'double',
    EMPTY = 'empty',
}

export function calculate_lane_x(lane_index: number): number {
    return lane_index * (SCREEN_CONFIG.WIDTH / SCREEN_CONFIG.COLUMN_COUNT);
}

export function calculate_column_width(): number {
    return SCREEN_CONFIG.WIDTH / SCREEN_CONFIG.COLUMN_COUNT;
}

export function create_tile(
    lane_index: number,
    y_position: number,
    height: number,
    color: string = COLORS.BLACK,
    opacity: number = 1.0,
): TileData {
    const column_width = calculate_column_width();
    return {
        lane_index,
        x: calculate_lane_x(lane_index),
        y: y_position,
        width: column_width,
        height,
        color,
        opacity,
        is_pressed: false,
        is_game_over_indicator: false,
        flash_state: false,
        is_holding: false,
        progress: 0,
        is_released_early: false,
        completed_at: null,
        last_note_played_at: null,
        active_circle_animations: [],
    };
}

export function create_start_row(): { row: RowData; lane_index: number } {
    const start_y = SCREEN_CONFIG.HEIGHT - SCREEN_CONFIG.BASE_ROW_HEIGHT * 2;

    const lane_index = random_int(0, 3);

    const tile = create_tile(lane_index, start_y, SCREEN_CONFIG.BASE_ROW_HEIGHT, COLORS.YELLOW, 1.0);

    return {
        row: {
            row_index: 0,
            row_type: RowType.START,
            height_multiplier: 1,
            y_position: start_y,
            height: SCREEN_CONFIG.BASE_ROW_HEIGHT,
            tiles: [tile],
            is_completed: false,
            is_active: true,
        },
        lane_index,
    };
}

/**
 * Determines the occupied columns for a double row based on the preceding row type.
 * Ensures the generated pattern maintains reachable paths for the player without awkward cross-screen jumps.
 */
function determine_double_lanes(preceding_row: RowData | null): [number, number] {
    if (preceding_row === null) {
        return random_int(0, 1) === 0 ? [0, 2] : [1, 3];
    }

    if (preceding_row.row_type === RowType.SINGLE || preceding_row.row_type === RowType.START) {
        const single_lane = preceding_row.tiles[0]?.lane_index;
        if (single_lane === undefined) {
            return random_int(0, 1) === 0 ? [0, 2] : [1, 3];
        }

        if (single_lane === 0 || single_lane === 2) {
            return [1, 3];
        } else {
            return [0, 2];
        }
    }

    if (preceding_row.row_type === RowType.DOUBLE) {
        const occupied_lanes = preceding_row.tiles.map(r => r.lane_index);

        if (occupied_lanes.includes(0) && occupied_lanes.includes(2)) {
            return [1, 3];
        } else {
            return [0, 2];
        }
    }

    return random_int(0, 1) === 0 ? [0, 2] : [1, 3];
}

/**
 * Generates a single block row while ensuring a continuous playable path.
 * If the preceded row is a double, the single lane is chosen from the gaps.
 * Otherwise, the new lane ignores the `last_single_lane` to prevent straight vertical pillars.
 */
function generate_single_row(
    row_index: number,
    y_position: number,
    height: number,
    preceding_row: RowData | null,
    last_single_lane: number,
): { row: RowData; new_last_single_lane: number } {
    let lane: number;

    if (preceding_row && preceding_row.row_type === RowType.DOUBLE) {
        const occupied = preceding_row.tiles.map(r => r.lane_index);
        const empty_lanes = [0, 1, 2, 3].filter(s => !occupied.includes(s));
        const chosen_lane = empty_lanes[random_int(0, empty_lanes.length - 1)];
        lane = chosen_lane ?? 0;
    } else {
        const available_lanes = [0, 1, 2, 3].filter(s => s !== last_single_lane);
        const chosen_lane = available_lanes[random_int(0, available_lanes.length - 1)];
        lane = chosen_lane ?? 0;
    }

    const tile = create_tile(lane, y_position, height, COLORS.BLACK, 1.0);

    return {
        row: {
            row_index,
            row_type: RowType.SINGLE,
            height_multiplier: Math.round(height / SCREEN_CONFIG.BASE_ROW_HEIGHT),
            y_position,
            height,
            tiles: [tile],
            is_completed: false,
            is_active: false,
        },
        new_last_single_lane: lane,
    };
}

function generate_double_row(
    row_index: number,
    y_position: number,
    height: number,
    preceding_row: RowData | null,
): RowData {
    const lanes = determine_double_lanes(preceding_row);
    const tiles = lanes.map(lane => create_tile(lane, y_position, height, COLORS.BLACK, 1.0));

    return {
        row_index,
        row_type: RowType.DOUBLE,
        height_multiplier: Math.round(height / SCREEN_CONFIG.BASE_ROW_HEIGHT),
        y_position,
        height,
        tiles,
        is_completed: false,
        is_active: false,
    };
}

function generate_empty_row(row_index: number, y_position: number, height: number): RowData {
    return {
        row_index,
        row_type: RowType.EMPTY,
        height_multiplier: Math.round(height / SCREEN_CONFIG.BASE_ROW_HEIGHT),
        y_position,
        height,
        tiles: [],
        is_completed: true,
        is_active: false,
    };
}

function get_random_row_type(): GeneratedRowType {
    const types = [GeneratedRowType.SINGLE, GeneratedRowType.DOUBLE, GeneratedRowType.EMPTY];
    const chosen = types[random_int(0, types.length - 1)];
    return chosen ?? GeneratedRowType.SINGLE;
}

/**
 * Generates the full sequence of rows, starting from the bottom (highest Y value)
 * and building upwards by subtracting each row's height. Y=0 is the top visual boundary.
 */
export function generate_all_rows(row_count: number = DEFAULT_ROW_COUNT): RowData[] {
    const rows: RowData[] = [];

    const start_result = create_start_row();
    rows.push(start_result.row);

    let last_single_lane = start_result.lane_index;

    let current_y = start_result.row.y_position;

    let preceding_row: RowData = start_result.row;

    for (let i = 1; i <= row_count; i++) {
        const height_multiplier = random_int(1, 8);
        const row_height = height_multiplier * SCREEN_CONFIG.BASE_ROW_HEIGHT;

        current_y -= row_height;

        const row_type = get_random_row_type();
        let row: RowData;

        if (row_type === GeneratedRowType.SINGLE) {
            const result = generate_single_row(i, current_y, row_height, preceding_row, last_single_lane);
            row = result.row;
            last_single_lane = result.new_last_single_lane;
        } else if (row_type === GeneratedRowType.DOUBLE) {
            row = generate_double_row(i, current_y, row_height, preceding_row);
        } else {
            row = generate_empty_row(i, current_y, row_height);
        }

        rows.push(row);
        preceding_row = row;
    }

    return rows;
}

export function find_active_row(rows: RowData[], scroll_offset: number): RowData | null {
    const screen_bottom = SCREEN_CONFIG.HEIGHT;

    for (const row of rows) {
        if (!row.is_completed && row.row_type !== RowType.START) {
            const screen_y = row.y_position + scroll_offset;
            const row_bottom = screen_y + row.height;

            if (row_bottom > 0 && screen_y < screen_bottom) {
                return row;
            }
        }
    }

    const start_row = rows.find(r => r.row_type === RowType.START);
    if (start_row && !start_row.is_completed) {
        return start_row;
    }

    return null;
}

export function is_row_visible(row: RowData, scroll_offset: number): boolean {
    const screen_y = row.y_position + scroll_offset;
    const row_bottom = screen_y + row.height;
    return row_bottom > 0 && screen_y < SCREEN_CONFIG.HEIGHT;
}
