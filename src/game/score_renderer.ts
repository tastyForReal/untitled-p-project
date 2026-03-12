import { BitmapFontRenderer } from '../renderers/bitmap_font_renderer.js';
import { ScoreData, BonusLabel } from './score_types.js';
import { SCREEN_CONFIG } from './types.js';

const SCORE_COUNTER_CONFIG = {
    FONT_SIZE: 80,

    TEXT_COLOR: [248 / 255, 98 / 255, 90 / 255, 1.0] as [number, number, number, number],

    SHADOW_COLOR: [0, 0, 0, 1.0] as [number, number, number, number],

    SHADOW_OFFSET_X: 1,

    SHADOW_OFFSET_Y: 1,

    Y_POSITION_PERCENT: 0.125,

    ANCHOR_X: 0.5,

    ANCHOR_Y: 0.5,
};

const BONUS_LABEL_CONFIG = {
    FONT_SIZE: 72,

    TEXT_COLOR: [40 / 255, 162 / 255, 252 / 255, 1.0] as [number, number, number, number],

    ANCHOR_X: 0.5,

    ANCHOR_Y: 0.5,
};

function calculate_font_scale(target_size: number): number {
    const BASE_FONT_SIZE = 128;
    return target_size / BASE_FONT_SIZE;
}

function calculate_score_y_position(): number {
    return SCREEN_CONFIG.HEIGHT * SCORE_COUNTER_CONFIG.Y_POSITION_PERCENT;
}

function render_score_counter(
    font_renderer: BitmapFontRenderer,
    score_data: ScoreData,
    render_pass: GPURenderPassEncoder,
): void {
    const score_text = score_data.override_display_text ?? `${score_data.total_score}`;
    const scale = calculate_font_scale(SCORE_COUNTER_CONFIG.FONT_SIZE) * score_data.animation.current_scale;

    const x = SCREEN_CONFIG.WIDTH / 2;
    const y = calculate_score_y_position();

    const shadow_x = x + SCORE_COUNTER_CONFIG.SHADOW_OFFSET_X;
    const shadow_y = y + SCORE_COUNTER_CONFIG.SHADOW_OFFSET_Y;
    font_renderer.render_text(
        score_text,
        shadow_x,
        shadow_y,
        scale,
        SCORE_COUNTER_CONFIG.SHADOW_COLOR,
        0,
        render_pass,
        SCORE_COUNTER_CONFIG.ANCHOR_X,
        SCORE_COUNTER_CONFIG.ANCHOR_Y,
    );

    font_renderer.render_text(
        score_text,
        x,
        y,
        scale,
        SCORE_COUNTER_CONFIG.TEXT_COLOR,
        0,
        render_pass,
        SCORE_COUNTER_CONFIG.ANCHOR_X,
        SCORE_COUNTER_CONFIG.ANCHOR_Y,
    );
}

function render_bonus_label(
    font_renderer: BitmapFontRenderer,
    label: BonusLabel,
    scroll_offset: number,
    render_pass: GPURenderPassEncoder,
): void {
    const anim = label.animation;
    const scale = calculate_font_scale(BONUS_LABEL_CONFIG.FONT_SIZE) * anim.scale;

    const color: [number, number, number, number] = [
        BONUS_LABEL_CONFIG.TEXT_COLOR[0],
        BONUS_LABEL_CONFIG.TEXT_COLOR[1],
        BONUS_LABEL_CONFIG.TEXT_COLOR[2],
        anim.opacity,
    ];

    const x = label.x;
    const y = label.base_y + scroll_offset;

    font_renderer.render_text(
        label.text,
        x,
        y,
        scale,
        color,
        0,
        render_pass,
        BONUS_LABEL_CONFIG.ANCHOR_X,
        BONUS_LABEL_CONFIG.ANCHOR_Y,
    );
}

function render_bonus_labels(
    font_renderer: BitmapFontRenderer,
    score_data: ScoreData,
    scroll_offset: number,
    render_pass: GPURenderPassEncoder,
): void {
    for (const label of score_data.bonus_labels) {
        render_bonus_label(font_renderer, label, scroll_offset, render_pass);
    }
}

export class ScoreRenderer {
    private font_renderer: BitmapFontRenderer;

    constructor(font_renderer: BitmapFontRenderer) {
        this.font_renderer = font_renderer;
    }

    render(score_data: ScoreData, scroll_offset: number, render_pass: GPURenderPassEncoder): void {
        if (!this.font_renderer.is_loaded()) {
            return;
        }

        render_score_counter(this.font_renderer, score_data, render_pass);

        render_bonus_labels(this.font_renderer, score_data, scroll_offset, render_pass);
    }

    is_ready(): boolean {
        return this.font_renderer.is_loaded();
    }
}
