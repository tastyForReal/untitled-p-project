import { Color } from '../graphics/color.js';
import { RowType, RowData, TileData, SCREEN_CONFIG } from './types.js';

export const DEFAULT_ROW_COUNT = 100;

const COLUMN_WIDTH = SCREEN_CONFIG.WIDTH / SCREEN_CONFIG.COLUMN_COUNT;
const LANE_X_POSITIONS: readonly number[] = [0, COLUMN_WIDTH, COLUMN_WIDTH * 2, COLUMN_WIDTH * 3] as const;

const enum GeneratedRowType {
    SingleTileRow = 0,
    DoubleTileRow = 1,
    EmptyRow = 2,
}

const ROW_TYPE_WEIGHT_0 = 0.6;
const ROW_TYPE_WEIGHT_1 = 0.25;
const ROW_TYPE_THRESHOLD_1 = ROW_TYPE_WEIGHT_0;
const ROW_TYPE_THRESHOLD_2 = ROW_TYPE_THRESHOLD_1 + ROW_TYPE_WEIGHT_1;

export function calculate_lane_x(lane_index: number): number {
    return LANE_X_POSITIONS[lane_index] ?? 0;
}

export function calculate_column_width(): number {
    return COLUMN_WIDTH;
}

const DEFAULT_TILE_STATE = {
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

export function create_tile(
    lane_index: number,
    y_position: number,
    height: number,
    color: Color = Color.Black,
    opacity: number = 1.0,
): TileData {
    return {
        lane_index,
        x: LANE_X_POSITIONS[lane_index] ?? 0,
        y: y_position,
        width: COLUMN_WIDTH,
        height,
        color,
        opacity,
        ...DEFAULT_TILE_STATE,
    };
}

export function create_start_row(): { row: RowData; lane_index: number } {
    const start_y = SCREEN_CONFIG.HEIGHT - SCREEN_CONFIG.BASE_ROW_HEIGHT * 2;
    const lane_index = (Math.random() * 4) | 0;

    return {
        row: {
            row_index: 0,
            row_type: RowType.StartingTileRow,
            height_multiplier: 1,
            y_position: start_y,
            height: SCREEN_CONFIG.BASE_ROW_HEIGHT,
            tiles: [create_tile(lane_index, start_y, SCREEN_CONFIG.BASE_ROW_HEIGHT, Color.Black, 1.0)],
            is_completed: false,
            is_active: true,
        },
        lane_index,
    };
}

function determine_double_lanes(preceding_row: RowData | null): [number, number] {
    if (preceding_row === null) {
        return Math.random() < 0.5 ? [0, 2] : [1, 3];
    }

    const row_type = preceding_row.row_type;

    if (row_type === RowType.SingleTileRow || row_type === RowType.StartingTileRow) {
        const single_lane = preceding_row.tiles[0]?.lane_index;
        if (single_lane === undefined) {
            return Math.random() < 0.5 ? [0, 2] : [1, 3];
        }
        return (single_lane & 1) === 0 ? [1, 3] : [0, 2];
    }

    if (row_type === RowType.DoubleTileRow) {
        const tiles = preceding_row.tiles;
        const tile0 = tiles[0];
        const tile1 = tiles[1];
        const has_lanes_0_2 =
            tiles.length >= 2 &&
            tile0 !== undefined &&
            tile1 !== undefined &&
            (tile0.lane_index === 0 || tile1.lane_index === 0) &&
            (tile0.lane_index === 2 || tile1.lane_index === 2);
        return has_lanes_0_2 ? [1, 3] : [0, 2];
    }

    return Math.random() < 0.5 ? [0, 2] : [1, 3];
}

function get_random_row_type(): GeneratedRowType {
    const rand = Math.random();
    if (rand < ROW_TYPE_THRESHOLD_1) return GeneratedRowType.SingleTileRow;
    if (rand < ROW_TYPE_THRESHOLD_2) return GeneratedRowType.DoubleTileRow;
    return GeneratedRowType.EmptyRow;
}

function generate_single_row(
    row_index: number,
    y_position: number,
    height: number,
    preceding_row: RowData | null,
    last_single_lane: number,
): { row: RowData; new_last_single_lane: number } {
    let lane: number;

    if (preceding_row?.row_type === RowType.DoubleTileRow) {
        const tiles = preceding_row.tiles;
        const tile0 = tiles[0];
        const tile1 = tiles[1];
        const occupied_0 = tile0?.lane_index === 0 || tile1?.lane_index === 0;
        const occupied_1 = tile0?.lane_index === 1 || tile1?.lane_index === 1;
        const occupied_2 = tile0?.lane_index === 2 || tile1?.lane_index === 2;
        const occupied_3 = tile0?.lane_index === 3 || tile1?.lane_index === 3;

        const empty_lanes: number[] = [];
        if (!occupied_0) empty_lanes.push(0);
        if (!occupied_1) empty_lanes.push(1);
        if (!occupied_2) empty_lanes.push(2);
        if (!occupied_3) empty_lanes.push(3);

        const random_index = (Math.random() * empty_lanes.length) | 0;
        lane = empty_lanes[random_index] ?? 0;
    } else {
        const available_lanes = [0, 1, 2, 3].filter(s => s !== last_single_lane);
        const random_index = (Math.random() * available_lanes.length) | 0;
        lane = available_lanes[random_index] ?? 0;
    }

    return {
        row: {
            row_index,
            row_type: RowType.SingleTileRow,
            height_multiplier: (height / SCREEN_CONFIG.BASE_ROW_HEIGHT) | 0,
            y_position,
            height,
            tiles: [create_tile(lane, y_position, height)],
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
    const [lane1, lane2] = determine_double_lanes(preceding_row);

    return {
        row_index,
        row_type: RowType.DoubleTileRow,
        height_multiplier: (height / SCREEN_CONFIG.BASE_ROW_HEIGHT) | 0,
        y_position,
        height,
        tiles: [create_tile(lane1, y_position, height), create_tile(lane2, y_position, height)],
        is_completed: false,
        is_active: false,
    };
}

function generate_empty_row(row_index: number, y_position: number, height: number): RowData {
    return {
        row_index,
        row_type: RowType.EmptyRow,
        height_multiplier: (height / SCREEN_CONFIG.BASE_ROW_HEIGHT) | 0,
        y_position,
        height,
        tiles: [],
        is_completed: true,
        is_active: false,
    };
}

export function generate_all_rows(row_count: number = DEFAULT_ROW_COUNT): RowData[] {
    const rows: RowData[] = [];
    const start_result = create_start_row();
    rows.push(start_result.row);

    let last_single_lane = start_result.lane_index;
    let current_y = start_result.row.y_position;
    let preceding_row: RowData = start_result.row;

    for (let i = 1; i <= row_count; i++) {
        const height_multiplier = 1 + ((Math.random() * 8) | 0);
        const row_height = height_multiplier * SCREEN_CONFIG.BASE_ROW_HEIGHT;
        current_y -= row_height;

        const row_type = get_random_row_type();
        let row: RowData;

        if (row_type === GeneratedRowType.SingleTileRow) {
            const result = generate_single_row(i, current_y, row_height, preceding_row, last_single_lane);
            row = result.row;
            last_single_lane = result.new_last_single_lane;
        } else if (row_type === GeneratedRowType.DoubleTileRow) {
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
    const screen_height = SCREEN_CONFIG.HEIGHT;

    for (let i = 0, len = rows.length; i < len; i++) {
        const row = rows[i];
        if (row === undefined || row.is_completed || row.row_type === RowType.StartingTileRow) continue;

        const screen_y = row.y_position + scroll_offset;
        if (screen_y + row.height > 0 && screen_y < screen_height) {
            return row;
        }
    }

    const start_row = rows[0];
    if (start_row !== undefined && start_row.row_type === RowType.StartingTileRow && !start_row.is_completed) {
        return start_row;
    }

    return null;
}

export function is_row_visible(row: RowData, scroll_offset: number): boolean {
    const screen_y = row.y_position + scroll_offset;
    return screen_y + row.height > 0 && screen_y < SCREEN_CONFIG.HEIGHT;
}
