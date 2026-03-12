import { log_error } from './logger.js';
import { GPUContext } from '../renderers/gpu_context.js';
import { Renderer } from '../renderers/renderer.js';
import { GameStateManager, GameConfig, DEFAULT_GAME_CONFIG } from './game_state.js';
import { InputHandler } from './input_handler.js';
import { GameState, GameMode, EndlessConfig, InputType } from './types.js';
import { LevelData, RowTypeResult } from './json_level_reader.js';
import { ScoreRenderer } from './score_renderer.js';

export class GameController {
    private gpu_context: GPUContext;
    private renderer: Renderer;
    private game_state: GameStateManager;
    private input_handler: InputHandler;
    private last_frame_time: number = 0;
    private is_running: boolean = false;
    private animation_frame_id: number | null = null;
    private score_renderer: ScoreRenderer | null = null;

    constructor(config?: Partial<GameConfig>) {
        this.gpu_context = new GPUContext();
        this.renderer = new Renderer(this.gpu_context);
        const merged_config = { ...DEFAULT_GAME_CONFIG, ...config };
        this.game_state = new GameStateManager(merged_config);
        this.input_handler = new InputHandler();
    }

    async initialize(canvas: HTMLCanvasElement): Promise<boolean> {
        const gpu_initialized = await this.gpu_context.initialize(canvas);
        if (!gpu_initialized) {
            log_error('Failed to initialize WebGPU');
            return false;
        }

        const renderer_initialized = await this.renderer.initialize();
        if (!renderer_initialized) {
            log_error('Failed to initialize renderer');
            return false;
        }

        this.input_handler.initialize(canvas);

        this.score_renderer = new ScoreRenderer(this.renderer.get_font_renderer());

        this.setup_input_callbacks();

        return true;
    }

    private setup_input_callbacks(): void {
        this.input_handler.set_lane_input_callback(
            (lane_index: number, screen_x: number, screen_y: number, is_down: boolean, input_type: InputType) => {
                this.handle_lane_input(lane_index, screen_x, screen_y, is_down, input_type);
            },
        );

        this.input_handler.set_reset_callback(() => {
            this.handle_reset();
        });
    }

    private handle_lane_input(
        lane_index: number,
        screen_x: number,
        screen_y: number,
        is_down: boolean,
        input_type: InputType,
    ): void {
        const state = this.game_state.get_game_data();

        if (
            state.state === GameState.TileMisclicked ||
            state.state === GameState.TileFellOffScreen ||
            state.state === GameState.Cleared
        ) {
            return;
        }

        if (input_type === InputType.Keyboard) {
            this.game_state.handle_keyboard_input(lane_index, is_down);
        } else {
            this.game_state.handle_lane_input(lane_index, screen_x, screen_y, is_down);
        }
    }

    toggle_pause(allow_with_bot: boolean = false): void {
        this.game_state.toggle_pause(allow_with_bot);
    }

    is_paused(): boolean {
        return this.game_state.is_paused();
    }

    has_game_started(): boolean {
        return this.game_state.has_game_started();
    }

    is_start_tile_pressed(): boolean {
        return this.game_state.is_start_tile_pressed();
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
        this.game_state.update_score(current_time);
    }

    private render(): void {
        const visible_rows = this.game_state.get_visible_rows();
        const particles = this.game_state.get_particle_system().get_particles();
        const game_over_indicator = this.game_state.get_game_over_tile();
        const scroll_offset = this.game_state.get_game_data().scroll_offset;
        const note_indicators = this.game_state.get_active_note_indicators();
        const start_tile_pressed = this.game_state.is_start_tile_pressed();
        const score_data = this.game_state.get_score_data();
        this.renderer.render(
            visible_rows,
            particles,
            game_over_indicator,
            scroll_offset,
            note_indicators,
            start_tile_pressed,
            score_data,
            this.score_renderer,
            this.game_state.get_config().is_red_note_indicator_enabled,
        );
    }

    resize(width: number, height: number): void {
        this.renderer.resize(width, height);
    }

    load_level(
        level_data: LevelData,
        game_mode: GameMode = GameMode.OneRound,
        endless_config: EndlessConfig | null = null,
        filename: string = '',
    ): void {
        this.game_state.load_level(level_data, game_mode, endless_config, filename);
    }

    load_custom_rows(level_rows: RowTypeResult[]): void {
        this.game_state.load_custom_rows(level_rows);
    }
}
