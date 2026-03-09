/**
 * Score Renderer handles rendering of score counter and bonus labels.
 * Uses BMFont for text rendering with WebGPU.
 */

import { BMFontRenderer } from '../renderers/bm_font_renderer.js';
import { ScoreData, BonusLabel } from './score_types.js';
import { SCREEN_CONFIG } from './types.js';

/**
 * Score counter display configuration.
 */
const SCORE_COUNTER_CONFIG = {
    /** Font size in pixels for the score counter */
    FONT_SIZE: 80,
    /** Text color for the score counter (#F8625A) */
    TEXT_COLOR: [248 / 255, 98 / 255, 90 / 255, 1.0] as [number, number, number, number],
    /** Drop shadow color (black #000000) */
    SHADOW_COLOR: [0, 0, 0, 1.0] as [number, number, number, number],
    /** Drop shadow X offset in pixels */
    SHADOW_OFFSET_X: 1,
    /** Drop shadow Y offset in pixels */
    SHADOW_OFFSET_Y: 1,
    /** Y position as a percentage of screen height (12.5%) */
    Y_POSITION_PERCENT: 0.125,
    /** Anchor for horizontal alignment (0.5 = center) */
    ANCHOR_X: 0.5,
    /** Anchor for vertical alignment (0.5 = center) */
    ANCHOR_Y: 0.5,
};

/**
 * Bonus label display configuration.
 */
const BONUS_LABEL_CONFIG = {
    /** Font size in pixels for bonus labels */
    FONT_SIZE: 72,
    /** Text color for bonus labels (#28A2FC) */
    TEXT_COLOR: [40 / 255, 162 / 255, 252 / 255, 1.0] as [number, number, number, number],
    /** Anchor for horizontal alignment (0.5 = center) */
    ANCHOR_X: 0.5,
    /** Anchor for vertical alignment (0.5 = center) */
    ANCHOR_Y: 0.5,
};

/**
 * Calculates the scale factor for a target font size.
 * The base font size in the BMFont file is 128px.
 *
 * @param target_size The desired font size in pixels
 * @returns The scale factor to apply
 */
function calculate_font_scale(target_size: number): number {
    // Base font size is 128px (from SofiaSansExtraCondensed.fnt)
    const BASE_FONT_SIZE = 128;
    return target_size / BASE_FONT_SIZE;
}

/**
 * Calculates the Y position for the score counter.
 * Positioned at screen_height * 0.125 from the top.
 *
 * @returns The Y coordinate for the score counter
 */
function calculate_score_y_position(): number {
    return SCREEN_CONFIG.HEIGHT * SCORE_COUNTER_CONFIG.Y_POSITION_PERCENT;
}

/**
 * Renders the score counter with drop shadow and optional scale animation.
 * Uses centered anchor (0.5, 0.5) for both text and shadow.
 *
 * @param font_renderer The BMFont renderer instance
 * @param score_data The current score data
 * @param render_pass The WebGPU render pass encoder
 */
function render_score_counter(
    font_renderer: BMFontRenderer,
    score_data: ScoreData,
    render_pass: GPURenderPassEncoder,
): void {
    const score_text = score_data.override_display_text ?? `${score_data.total_score}`;
    const scale = calculate_font_scale(SCORE_COUNTER_CONFIG.FONT_SIZE) * score_data.animation.current_scale;

    // Center position for the score text
    const x = SCREEN_CONFIG.WIDTH / 2;
    const y = calculate_score_y_position();

    // Render drop shadow first (behind the main text)
    // With anchor 0.5, 0.5, the shadow offset is applied directly to the position
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

    // Render main score text on top
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

/**
 * Renders a single bonus label with its current animation state.
 * The label moves with the tiles at the same scroll speed.
 * Uses centered anchor (0.5, 0.5) so the text is centered on the given position.
 *
 * @param font_renderer The BMFont renderer instance
 * @param label The bonus label to render
 * @param scroll_offset Current scroll offset for Y position calculation
 * @param render_pass The WebGPU render pass encoder
 */
function render_bonus_label(
    font_renderer: BMFontRenderer,
    label: BonusLabel,
    scroll_offset: number,
    render_pass: GPURenderPassEncoder,
): void {
    const anim = label.animation;
    const scale = calculate_font_scale(BONUS_LABEL_CONFIG.FONT_SIZE) * anim.scale;

    // Calculate color with current opacity
    const color: [number, number, number, number] = [
        BONUS_LABEL_CONFIG.TEXT_COLOR[0],
        BONUS_LABEL_CONFIG.TEXT_COLOR[1],
        BONUS_LABEL_CONFIG.TEXT_COLOR[2],
        anim.opacity,
    ];

    // Position is already the center point (with anchor 0.5, 0.5)
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

/**
 * Renders all active bonus labels.
 *
 * @param font_renderer The BMFont renderer instance
 * @param score_data The current score data containing bonus labels
 * @param scroll_offset Current scroll offset for Y position calculation
 * @param render_pass The WebGPU render pass encoder
 */
function render_bonus_labels(
    font_renderer: BMFontRenderer,
    score_data: ScoreData,
    scroll_offset: number,
    render_pass: GPURenderPassEncoder,
): void {
    for (const label of score_data.bonus_labels) {
        render_bonus_label(font_renderer, label, scroll_offset, render_pass);
    }
}

/**
 * Main ScoreRenderer class that handles all score-related rendering.
 */
export class ScoreRenderer {
    private font_renderer: BMFontRenderer;

    /**
     * Creates a new ScoreRenderer instance.
     *
     * @param font_renderer The BMFont renderer to use for text rendering
     */
    constructor(font_renderer: BMFontRenderer) {
        this.font_renderer = font_renderer;
    }

    /**
     * Renders the score counter and all active bonus labels.
     *
     * @param score_data The current score data
     * @param scroll_offset Current scroll offset for bonus label positioning
     * @param render_pass The WebGPU render pass encoder
     */
    render(score_data: ScoreData, scroll_offset: number, render_pass: GPURenderPassEncoder): void {
        if (!this.font_renderer.is_loaded()) {
            return;
        }

        // Render score counter (with drop shadow)
        render_score_counter(this.font_renderer, score_data, render_pass);

        // Render bonus labels (they move with the tiles)
        render_bonus_labels(this.font_renderer, score_data, scroll_offset, render_pass);
    }

    /**
     * Checks if the font renderer is ready.
     */
    is_ready(): boolean {
        return this.font_renderer.is_loaded();
    }
}
