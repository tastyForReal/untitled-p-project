import { RowData, TileData, RowType } from './types.js';
import { ScoreData, ScoreAnimationState, BonusLabel } from './score_types.js';

const DEFAULT_SCORE_ANIMATION: ScoreAnimationState = {
    current_scale: 1.0,
    target_scale: 1.0,
    start_time: 0,
    duration: 100,
    is_animating: false,
};

export function create_initial_score_data(): ScoreData {
    return {
        total_score: 0,
        animation: { ...DEFAULT_SCORE_ANIMATION },
        bonus_labels: [],
    };
}

export function calculate_tile_score(tile: TileData, row: RowData): number {
    if (row.row_type === RowType.EmptyRow) {
        return 0;
    }

    if (row.height_multiplier === 1) {
        if (row.row_type === RowType.SingleTileRow || row.row_type === RowType.StartingTileRow) {
            return 1;
        }
        if (row.row_type === RowType.DoubleTileRow) {
            return 2;
        }
        return 0;
    }

    const hold_progress = tile.progress;
    const total_progress = tile.height;
    const row_height_multiplier = row.height_multiplier;

    if (tile.is_released_early && hold_progress < total_progress) {
        return Math.floor((hold_progress / total_progress) * row_height_multiplier) + 1;
    }

    return Math.floor((total_progress / total_progress) * row_height_multiplier) + 1;
}

export function trigger_score_animation(score_data: ScoreData, current_time: number): void {
    score_data.animation = {
        current_scale: 1.0,
        target_scale: 1.08,
        start_time: current_time,
        duration: 100,
        is_animating: true,
    };
}

const BONUS_LABEL_POSITIONING = {
    TEXT_HEIGHT: 72,

    HALF_TEXT_HEIGHT: 36,

    GAP_ABOVE_TILE: 8,
};

export function create_bonus_label(tile: TileData, bonus_score: number, current_time: number): BonusLabel {
    const lane_center_x = tile.x + tile.width / 2;

    const label_base_y = tile.y - BONUS_LABEL_POSITIONING.HALF_TEXT_HEIGHT - BONUS_LABEL_POSITIONING.GAP_ABOVE_TILE;

    return {
        x: lane_center_x,
        base_y: label_base_y,
        text: `+${bonus_score}`,
        animation: {
            scale: 1.0,
            opacity: 1.0,
            start_time: current_time,
            scale_duration: 250,
            fade_duration: 500,
            is_complete: false,
        },
    };
}

export function update_score_animation(score_data: ScoreData, current_time: number): void {
    const anim = score_data.animation;
    if (!anim.is_animating) {
        return;
    }

    const elapsed = current_time - anim.start_time;

    if (elapsed < anim.duration) {
        const progress = elapsed / anim.duration;
        anim.current_scale = 1.0 + 0.08 * progress;
    } else if (elapsed < anim.duration * 2) {
        const progress = (elapsed - anim.duration) / anim.duration;
        anim.current_scale = 1.08 - 0.08 * progress;
    } else {
        anim.current_scale = 1.0;
        anim.is_animating = false;
    }
}

export function update_bonus_label_animations(score_data: ScoreData, current_time: number): void {
    for (const label of score_data.bonus_labels) {
        const anim = label.animation;
        if (anim.is_complete) {
            continue;
        }

        const elapsed = current_time - anim.start_time;

        if (elapsed < anim.scale_duration) {
            const progress = elapsed / anim.scale_duration;
            anim.scale = 1.0 + 0.08 * progress;
        } else if (elapsed < anim.scale_duration * 2) {
            const progress = (elapsed - anim.scale_duration) / anim.scale_duration;
            anim.scale = 1.08 - 0.08 * progress;
        } else {
            anim.scale = 1.0;
        }

        if (elapsed < anim.fade_duration) {
            anim.opacity = 1.0 - elapsed / anim.fade_duration;
        } else {
            anim.opacity = 0.0;
            anim.is_complete = true;
        }
    }

    score_data.bonus_labels = score_data.bonus_labels.filter(label => !label.animation.is_complete);
}

export class ScoreManager {
    private score_data: ScoreData;

    constructor() {
        this.score_data = create_initial_score_data();
    }

    get_score_data(): Readonly<ScoreData> {
        return this.score_data;
    }

    get_total_score(): number {
        return this.score_data.total_score;
    }

    reset(): void {
        this.score_data = create_initial_score_data();
    }

    add_tile_score(tile: TileData, row: RowData, current_time: number): number {
        const score = calculate_tile_score(tile, row);

        if (score > 0) {
            this.score_data.total_score += score;
            trigger_score_animation(this.score_data, current_time);

            if (row.height_multiplier > 1 && !tile.is_released_early) {
                const bonus_label = create_bonus_label(tile, score, current_time);
                this.score_data.bonus_labels.push(bonus_label);
            }
        }

        return score;
    }

    update(current_time: number): void {
        update_score_animation(this.score_data, current_time);
        update_bonus_label_animations(this.score_data, current_time);
    }

    has_active_bonus_labels(): boolean {
        return this.score_data.bonus_labels.length > 0;
    }
}
