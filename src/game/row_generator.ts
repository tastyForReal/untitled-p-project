import { random_int } from "../utils/math_utils.js";
import { RowType, RowData, TileData, SCREEN_CONFIG, COLORS } from "./types.js";

export const DEFAULT_ROW_COUNT = 100;

enum GeneratedRowType {
    SINGLE = "single",
    DOUBLE = "double",
    EMPTY = "empty",
}

export function calculate_slot_x(slot_index: number): number {
    return slot_index * (SCREEN_CONFIG.WIDTH / SCREEN_CONFIG.COLUMN_COUNT);
}

export function calculate_column_width(): number {
    return SCREEN_CONFIG.WIDTH / SCREEN_CONFIG.COLUMN_COUNT;
}

export function create_rectangle(
    slot_index: number,
    y_position: number,
    height: number,
    color: string = COLORS.BLACK,
    opacity: number = 1.0,
): TileData {
    const column_width = calculate_column_width();
    return {
        slot_index,
        x: calculate_slot_x(slot_index),
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
    };
}

export function create_start_row(): { row: RowData; slot_index: number } {
    const start_y = SCREEN_CONFIG.HEIGHT - SCREEN_CONFIG.BASE_ROW_HEIGHT * 2;

    const slot_index = random_int(0, 3);

    const rectangle = create_rectangle(slot_index, start_y, SCREEN_CONFIG.BASE_ROW_HEIGHT, COLORS.YELLOW, 1.0);

    return {
        row: {
            row_index: 0,
            row_type: RowType.START,
            height_multiplier: 1,
            y_position: start_y,
            height: SCREEN_CONFIG.BASE_ROW_HEIGHT,
            rectangles: [rectangle],
            is_completed: false,
            is_active: true,
        },
        slot_index,
    };
}

/**
 * Determines the occupied columns for a double row based on the preceding row type.
 * Ensures the generated pattern maintains reachable paths for the player without awkward cross-screen jumps.
 */
function determine_double_slots(preceding_row: RowData | null): [number, number] {
    if (preceding_row === null) {
        return random_int(0, 1) === 0 ? [0, 2] : [1, 3];
    }

    if (preceding_row.row_type === RowType.SINGLE || preceding_row.row_type === RowType.START) {
        const single_slot = preceding_row.rectangles[0]?.slot_index;
        if (single_slot === undefined) {
            return random_int(0, 1) === 0 ? [0, 2] : [1, 3];
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

    return random_int(0, 1) === 0 ? [0, 2] : [1, 3];
}

/**
 * Generates a single block row while ensuring a continuous playable path.
 * If the preceded row is a double, the single slot is chosen from the gaps.
 * Otherwise, the new slot ignores the `last_single_slot` to prevent straight vertical pillars.
 */
function generate_single_row(
    row_index: number,
    y_position: number,
    height: number,
    preceding_row: RowData | null,
    last_single_slot: number,
): { row: RowData; new_last_single_slot: number } {
    let slot: number;

    if (preceding_row && preceding_row.row_type === RowType.DOUBLE) {
        const occupied = preceding_row.rectangles.map(r => r.slot_index);
        const empty_slots = [0, 1, 2, 3].filter(s => !occupied.includes(s));
        const chosen_slot = empty_slots[random_int(0, empty_slots.length - 1)];
        slot = chosen_slot ?? 0;
    } else {
        const available_slots = [0, 1, 2, 3].filter(s => s !== last_single_slot);
        const chosen_slot = available_slots[random_int(0, available_slots.length - 1)];
        slot = chosen_slot ?? 0;
    }

    const rectangle = create_rectangle(slot, y_position, height, COLORS.BLACK, 1.0);

    return {
        row: {
            row_index,
            row_type: RowType.SINGLE,
            height_multiplier: Math.round(height / SCREEN_CONFIG.BASE_ROW_HEIGHT),
            y_position,
            height,
            rectangles: [rectangle],
            is_completed: false,
            is_active: false,
        },
        new_last_single_slot: slot,
    };
}

function generate_double_row(
    row_index: number,
    y_position: number,
    height: number,
    preceding_row: RowData | null,
): RowData {
    const slots = determine_double_slots(preceding_row);
    const rectangles = slots.map(slot => create_rectangle(slot, y_position, height, COLORS.BLACK, 1.0));

    return {
        row_index,
        row_type: RowType.DOUBLE,
        height_multiplier: Math.round(height / SCREEN_CONFIG.BASE_ROW_HEIGHT),
        y_position,
        height,
        rectangles,
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
        rectangles: [],
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

    let last_single_slot = start_result.slot_index;

    let current_y = start_result.row.y_position;

    let preceding_row: RowData = start_result.row;

    for (let i = 1; i <= row_count; i++) {
        const height_multiplier = random_int(1, 8);
        const row_height = height_multiplier * SCREEN_CONFIG.BASE_ROW_HEIGHT;

        current_y -= row_height;

        const row_type = get_random_row_type();
        let row: RowData;

        if (row_type === GeneratedRowType.SINGLE) {
            const result = generate_single_row(i, current_y, row_height, preceding_row, last_single_slot);
            row = result.row;
            last_single_slot = result.new_last_single_slot;
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
