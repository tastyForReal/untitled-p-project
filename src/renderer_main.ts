import { log_error, log_message, log_warning } from './game/logger.js';
import { GameController } from './game/game_controller.js';
import { SCREEN_CONFIG } from './game/types.js';
import { select_and_load_music_file, LevelData } from './game/json_level_reader.js';
import { get_audio_manager } from './game/audio_manager.js';
import { show_customize_dialog } from './game/customize_dialog.js';

async function main(): Promise<void> {
    setTimeout(() => {
        const instructions = document.querySelector('.canvas_instructions') as HTMLElement | null;
        if (instructions) {
            instructions.style.display = 'none';
        }
    }, 5000);

    const canvas = document.getElementById('game_canvas') as HTMLCanvasElement | null;

    if (!canvas) {
        log_error('Canvas element not found');
        return;
    }

    canvas.width = SCREEN_CONFIG.WIDTH;
    canvas.height = SCREEN_CONFIG.HEIGHT;

    const url_params = new URLSearchParams(window.location.search);
    const is_bot_active = url_params.has('bot') || localStorage.getItem('bot') === 'true';
    const is_red_note_indicator_enabled = false;

    const game_controller = new GameController({ is_bot_active, is_red_note_indicator_enabled });

    const initialized = await game_controller.initialize(canvas);

    if (!initialized) {
        log_error('Failed to initialize game');
        const error_div = document.getElementById('error_message');
        if (error_div) {
            error_div.style.display = 'block';
            error_div.textContent = 'WebGPU is not supported in this browser. Please use a WebGPU-compatible browser.';
        }
        return;
    }

    const audio_manager = get_audio_manager();
    audio_manager
        .initialize()
        .then(success => {
            if (success) {
                log_message('Audio manager initialized successfully');
            } else {
                log_warning('Audio manager initialization failed');
            }
        })
        .catch(error => {
            log_warning('Audio manager initialization error:', error);
        });

    window.addEventListener('resize', () => {
        game_controller.resize(SCREEN_CONFIG.WIDTH, SCREEN_CONFIG.HEIGHT);
    });

    setup_focus_pause(game_controller);

    game_controller.start();

    setup_level_loader(game_controller);

    setup_pause_play_button(game_controller);
}

function get_filename_without_extension(filename: string): string {
    const last_dot = filename.lastIndexOf('.');
    if (last_dot <= 0) return filename;
    return filename.substring(0, last_dot);
}

function setup_level_loader(game_controller: GameController): void {
    const load_button = document.getElementById('load_level_btn');
    const load_status = document.getElementById('load_status');

    if (!load_button) {
        log_error('Load level button not found');
        return;
    }

    load_button.addEventListener('click', async () => {
        if (load_status) {
            load_status.textContent = 'Select a JSON file...';
            load_status.className = 'load_status';
            load_status.style.display = 'block';
        }

        try {
            const { level_data, filename } = await select_and_load_music_file();

            if (level_data.rows.length === 0) {
                if (load_status) {
                    load_status.textContent = 'No valid level data found in file';
                    load_status.className = 'load_status error';
                    load_status.style.display = 'block';
                    setTimeout(() => {
                        load_status.style.display = 'none';
                    }, 3000);
                }
                return;
            }

            if (load_status) {
                load_status.style.display = 'none';
            }

            const dialog_result = await show_customize_dialog(level_data);

            const modified_level_data: LevelData = {
                ...level_data,
                musics: level_data.musics.map((music, i) => ({
                    ...music,
                    tps: dialog_result.custom_tps_values[i] ?? music.tps,
                })),
            };

            const display_name = get_filename_without_extension(filename);

            game_controller.load_level(
                modified_level_data,
                dialog_result.game_mode,
                dialog_result.endless_config,
                display_name,
            );

            document.title = `${display_name} - Untitled P Project`;

            if (load_status) {
                const music_count = modified_level_data.musics.length;
                const first_music = modified_level_data.musics[0];
                const initial_tps = first_music ? first_music.tps.toFixed(2) : 'default';

                load_status.textContent = `Level loaded! (${modified_level_data.rows.length} rows, ${music_count} music(s), TPS: ${initial_tps})`;
                load_status.className = 'load_status success';
                load_status.style.display = 'block';

                setTimeout(() => {
                    load_status.style.display = 'none';
                }, 3000);
            }

            log_message(
                `Loaded level with ${modified_level_data.rows.length} rows from ${modified_level_data.musics.length} music(s)`,
            );
            log_message(`Base BPM: ${modified_level_data.base_bpm}`);
            modified_level_data.musics.forEach(m => {
                log_message(
                    `  Music ${m.id}: TPS=${m.tps.toFixed(2)}, rows=${m.row_count}, range=[${m.start_row_index}, ${m.end_row_index})`,
                );
            });
        } catch (error) {
            if (error instanceof Error && error.message === 'Dialog cancelled') {
                if (load_status) {
                    load_status.style.display = 'none';
                }
                return;
            }

            log_error('Failed to load level:', error);

            if (load_status) {
                load_status.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
                load_status.className = 'load_status error';
                load_status.style.display = 'block';

                setTimeout(() => {
                    load_status.style.display = 'none';
                }, 3000);
            }
        }
    });
}

function setup_pause_play_button(game_controller: GameController): void {
    const pause_play_button = document.getElementById('pause_play_btn');

    if (!pause_play_button) {
        log_error('Pause/play button not found');
        return;
    }

    pause_play_button.style.display = 'none';

    const update_button_state = (): void => {
        const has_started = game_controller.has_game_started();
        const is_start_pressed = game_controller.is_start_tile_pressed();
        const is_paused = game_controller.is_paused();
        const icon = pause_play_button.querySelector('.material-symbols-outlined');

        const should_show_button = is_start_pressed || has_started;

        if (should_show_button) {
            pause_play_button.style.display = 'flex';

            if (is_paused) {
                pause_play_button.classList.remove('playing');
                pause_play_button.classList.add('paused');
                if (icon) {
                    icon.textContent = 'play_arrow';
                }
            } else {
                pause_play_button.classList.remove('paused');
                pause_play_button.classList.add('playing');
                if (icon) {
                    icon.textContent = 'pause';
                }
            }
        } else {
            pause_play_button.style.display = 'none';
        }
    };

    pause_play_button.addEventListener('click', () => {
        game_controller.toggle_pause(true);
        update_button_state();
    });

    setInterval(update_button_state, 100);
}

function setup_focus_pause(game_controller: GameController): void {
    window.addEventListener('blur', () => {
        if (!game_controller.is_paused()) {
            game_controller.toggle_pause(true);
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden' && !game_controller.is_paused()) {
            game_controller.toggle_pause(true);
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
