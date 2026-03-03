import { GPUContext } from "../renderers/gpu_context.js";
import { Renderer } from "../renderers/renderer.js";
import { GameStateManager, GameConfig, DEFAULT_GAME_CONFIG } from "./game_state.js";
import { InputHandler } from "./input_handler.js";
import { GameState, InputType } from "./types.js";
import { LevelData, RowTypeResult } from "./json_level_reader.js";

/**
 * Orchestrates the main game loop (`requestAnimationFrame`) and bridges WebGPU rendering with pure game logic state.
 */
export class GameController {
    private gpu_context: GPUContext;
    private renderer: Renderer;
    private game_state: GameStateManager;
    private input_handler: InputHandler;
    private last_frame_time: number = 0;
    private is_running: boolean = false;
    private animation_frame_id: number | null = null;

    constructor(config?: Partial<GameConfig>) {
        this.gpu_context = new GPUContext();
        this.renderer = new Renderer(this.gpu_context);
        const merged_config = { ...DEFAULT_GAME_CONFIG, ...config };
        this.game_state = new GameStateManager(merged_config);
        this.input_handler = new InputHandler();
    }

    /**
     * Bootstraps the WebGPU context, renderer pipelines, and input listeners.
     * Expects a valid HTMLCanvasElement. Returns false if WebGPU is unsupported.
     */
    async initialize(canvas: HTMLCanvasElement): Promise<boolean> {
        const gpu_initialized = await this.gpu_context.initialize(canvas);
        if (!gpu_initialized) {
            console.error("Failed to initialize WebGPU");
            return false;
        }

        const renderer_initialized = await this.renderer.initialize();
        if (!renderer_initialized) {
            console.error("Failed to initialize renderer");
            return false;
        }

        this.input_handler.initialize(canvas);

        this.setup_input_callbacks();

        return true;
    }

    private setup_input_callbacks(): void {
        this.input_handler.set_slot_input_callback(
            (slot_index: number, screen_x: number, screen_y: number, is_down: boolean, input_type: InputType) => {
                this.handle_slot_input(slot_index, screen_x, screen_y, is_down, input_type);
            },
        );

        this.input_handler.set_reset_callback(() => {
            this.handle_reset();
        });
    }

    /**
     * Routes the physical pointer click or keyboard tap into the game logic.
     * Ignores input if the game is already in a GAME OVER state, or if keyboard input
     * was queued (to avoid double-processing via simulated click events on some platforms).
     */
    private handle_slot_input(
        slot_index: number,
        screen_x: number,
        screen_y: number,
        is_down: boolean,
        input_type: InputType,
    ): void {
        const state = this.game_state.get_game_data();

        if (
            state.state === GameState.GAME_OVER_MISCLICKED ||
            state.state === GameState.GAME_OVER_OUT_OF_BOUNDS ||
            state.state === GameState.GAME_WON
        ) {
            return;
        }

        if (input_type === InputType.KEYBOARD) {
            this.game_state.handle_keyboard_input(slot_index, is_down);
        } else {
            this.game_state.handle_slot_input(slot_index, screen_x, screen_y, is_down);
        }
    }

    /**
     * Public method to toggle pause state, can be called from UI buttons.
     */
    toggle_pause(allow_with_bot: boolean = false): void {
        this.game_state.toggle_pause(allow_with_bot);
    }

    /**
     * Returns true if the game is currently paused.
     */
    is_paused(): boolean {
        return this.game_state.is_paused();
    }

    private handle_reset(): void {
        this.game_state.reset();
    }

    start(): void {
        if (this.is_running) {
            return;
        }

        this.is_running = true;
        this.last_frame_time = performance.now();
        this.game_loop();
    }

    stop(): void {
        this.is_running = false;
        if (this.animation_frame_id !== null) {
            cancelAnimationFrame(this.animation_frame_id);
            this.animation_frame_id = null;
        }
    }

    private game_loop(): void {
        if (!this.is_running) {
            return;
        }

        const current_time = performance.now();
        const delta_time = (current_time - this.last_frame_time) / 1000;
        this.last_frame_time = current_time;
        this.update(delta_time, current_time);
        this.render();
        this.animation_frame_id = requestAnimationFrame(() => this.game_loop());
    }

    private update(delta_time: number, current_time: number): void {
        this.game_state.update_bot();
        this.game_state.update_scroll(delta_time);
        this.game_state.update_particles(delta_time);
        this.game_state.update_game_over_flash(current_time);
        this.game_state.update_game_over_animation(current_time);
        this.game_state.update_game_won(current_time);
    }

    private render(): void {
        const visible_rows = this.game_state.get_visible_rows();
        const particles = this.game_state.get_particle_system().get_particles();
        const game_over_indicator = this.game_state.get_game_over_indicator();
        const scroll_offset = this.game_state.get_game_data().scroll_offset;
        const note_indicators = this.game_state.get_active_note_indicators();
        this.renderer.render(visible_rows, particles, game_over_indicator, scroll_offset, note_indicators);
    }

    resize(width: number, height: number): void {
        this.renderer.resize(width, height);
    }

    /**
     * Loads a complete level with rows and music metadata for dynamic TPS
     */
    load_level(level_data: LevelData): void {
        this.game_state.load_level(level_data);
    }

    /**
     * Loads custom rows only (backward compatibility, uses default TPS)
     */
    load_custom_rows(level_rows: RowTypeResult[]): void {
        this.game_state.load_custom_rows(level_rows);
    }
}
