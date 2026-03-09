/**
 * Score-related type definitions for the scoring system.
 * Contains interfaces for score data, bonus labels, and animation states.
 */

/**
 * Animation state for score counter scale effect.
 * Tracks the current scale and timing for smooth pulse animations.
 */
export interface ScoreAnimationState {
    /** Current scale factor (1.0 = normal, > 1.0 = enlarged) */
    current_scale: number;
    /** Target scale to animate towards */
    target_scale: number;
    /** Animation start time in milliseconds */
    start_time: number;
    /** Animation duration in milliseconds */
    duration: number;
    /** Whether animation is currently active */
    is_animating: boolean;
}

/**
 * Animation state for bonus point labels.
 * Handles scale and fade animations for floating bonus text.
 */
export interface BonusLabelAnimation {
    /** Current scale factor */
    scale: number;
    /** Current opacity (0.0 to 1.0) */
    opacity: number;
    /** Animation start time in milliseconds */
    start_time: number;
    /** Scale animation duration in milliseconds */
    scale_duration: number;
    /** Fade animation duration in milliseconds */
    fade_duration: number;
    /** Whether the animation is complete and can be removed */
    is_complete: boolean;
}

/**
 * Represents a floating bonus point label displayed when completing long tiles.
 * Contains position, text content, and animation state.
 * The label moves with the tiles at the same scroll speed.
 */
export interface BonusLabel {
    /** X position of the label center (screen coordinates) */
    x: number;
    /** Base Y position of the label (tile coordinate, without scroll offset) */
    base_y: number;
    /** The bonus points text to display (e.g., "+5") */
    text: string;
    /** Current animation state for this label */
    animation: BonusLabelAnimation;
}

/**
 * Main score data structure tracking all scoring-related state.
 */
export interface ScoreData {
    /** Current total score */
    total_score: number;
    /** Animation state for the score counter */
    animation: ScoreAnimationState;
    /** Active bonus labels currently being displayed */
    bonus_labels: BonusLabel[];
    /** Optional override text to display instead of total_score (e.g., TPS in challenge mode) */
    override_display_text?: string;
}
