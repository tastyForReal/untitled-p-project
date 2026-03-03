import { GameController } from "./game/game_controller.js";
import { SCREEN_CONFIG } from "./game/types.js";
import { select_and_load_music_file, LevelData } from "./game/json_level_reader.js";
import { get_audio_manager } from "./game/audio_manager.js";

async function main(): Promise<void> {
    setTimeout(() => {
        const instructions = document.querySelector(".canvas_instructions") as HTMLElement | null;
        if (instructions) {
            instructions.style.display = "none";
        }
    }, 5000);

    const canvas = document.getElementById("game_canvas") as HTMLCanvasElement | null;

    if (!canvas) {
        console.error("Canvas element not found");
        return;
    }

    canvas.width = SCREEN_CONFIG.WIDTH;
    canvas.height = SCREEN_CONFIG.HEIGHT;

    const url_params = new URLSearchParams(window.location.search);
    const is_bot_active = url_params.has("bot") || localStorage.getItem("bot") === "true";

    const game_controller = new GameController({ is_bot_active });

    const initialized = await game_controller.initialize(canvas);

    if (!initialized) {
        console.error("Failed to initialize game");
        const error_div = document.getElementById("error_message");
        if (error_div) {
            error_div.style.display = "block";
            error_div.textContent = "WebGPU is not supported in this browser. Please use a WebGPU-compatible browser.";
        }
        return;
    }

    // Initialize audio manager (preload audio samples)
    const audio_manager = get_audio_manager();
    audio_manager
        .initialize()
        .then(success => {
            if (success) {
                console.log("Audio manager initialized successfully");
            } else {
                console.warn("Audio manager initialization failed");
            }
        })
        .catch(error => {
            console.warn("Audio manager initialization error:", error);
        });

    window.addEventListener("resize", () => {
        game_controller.resize(SCREEN_CONFIG.WIDTH, SCREEN_CONFIG.HEIGHT);
    });

    // Pause game when window loses focus
    setup_focus_pause(game_controller);

    game_controller.start();

    // Setup level loading button
    setup_level_loader(game_controller);

    // Setup pause/play button
    setup_pause_play_button(game_controller);
}

function setup_level_loader(game_controller: GameController): void {
    const load_button = document.getElementById("load_level_btn");
    const load_status = document.getElementById("load_status");

    if (!load_button) {
        console.error("Load level button not found");
        return;
    }

    load_button.addEventListener("click", async () => {
        if (load_status) {
            load_status.textContent = "Select a JSON file...";
            load_status.className = "load_status";
            load_status.style.display = "block";
        }

        try {
            const level_data: LevelData = await select_and_load_music_file();

            if (level_data.rows.length > 0) {
                // Load the complete level with metadata
                game_controller.load_level(level_data);

                if (load_status) {
                    const music_count = level_data.musics.length;
                    const first_music = level_data.musics[0];
                    const initial_tps = first_music ? first_music.tps.toFixed(2) : "default";

                    load_status.textContent = `Level loaded! (${level_data.rows.length} rows, ${music_count} music(s), TPS: ${initial_tps})`;
                    load_status.className = "load_status success";
                    load_status.style.display = "block";

                    // Hide status after 3 seconds
                    setTimeout(() => {
                        load_status.style.display = "none";
                    }, 3000);
                }

                console.log(
                    `Loaded level with ${level_data.rows.length} rows from ${level_data.musics.length} music(s)`,
                );
                console.log(`Base BPM: ${level_data.base_bpm}`);
                level_data.musics.forEach(m => {
                    console.log(
                        `  Music ${m.id}: TPS=${m.tps.toFixed(2)}, rows=${m.row_count}, range=[${m.start_row_index}, ${m.end_row_index})`,
                    );
                });
            } else {
                if (load_status) {
                    load_status.textContent = "No valid level data found in file";
                    load_status.className = "load_status error";
                    load_status.style.display = "block";

                    setTimeout(() => {
                        load_status.style.display = "none";
                    }, 3000);
                }
            }
        } catch (error) {
            console.error("Failed to load level:", error);

            if (load_status) {
                load_status.textContent = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
                load_status.className = "load_status error";
                load_status.style.display = "block";

                setTimeout(() => {
                    load_status.style.display = "none";
                }, 3000);
            }
        }
    });
}

function setup_pause_play_button(game_controller: GameController): void {
    const pause_play_button = document.getElementById("pause_play_btn");

    if (!pause_play_button) {
        console.error("Pause/play button not found");
        return;
    }

    // Hide button initially - it will be shown when game starts
    pause_play_button.style.display = "none";

    const update_button_state = (): void => {
        const has_started = game_controller.has_game_started();
        const is_start_pressed = game_controller.is_start_tile_pressed();
        const is_paused = game_controller.is_paused();
        const icon = pause_play_button.querySelector(".material-symbols-outlined");

        // Show button when yellow tile has been pressed OR when game has started
        // This ensures button stays visible even when auto-paused after yellow tile press
        const should_show_button = is_start_pressed || has_started;

        if (should_show_button) {
            pause_play_button.style.display = "flex";

            if (is_paused) {
                pause_play_button.classList.remove("playing");
                pause_play_button.classList.add("paused");
                if (icon) {
                    icon.textContent = "play_arrow";
                }
            } else {
                pause_play_button.classList.remove("paused");
                pause_play_button.classList.add("playing");
                if (icon) {
                    icon.textContent = "pause";
                }
            }
        } else {
            pause_play_button.style.display = "none";
        }
    };

    pause_play_button.addEventListener("click", () => {
        game_controller.toggle_pause(true);
        update_button_state();
    });

    // Update button state periodically to sync with game state
    setInterval(update_button_state, 100);
}

function setup_focus_pause(game_controller: GameController): void {
    // Pause game when window loses focus (blur event)
    window.addEventListener("blur", () => {
        if (!game_controller.is_paused()) {
            game_controller.toggle_pause(true);
        }
    });

    // Pause game when page visibility changes (e.g., tab switch, minimize)
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden" && !game_controller.is_paused()) {
            game_controller.toggle_pause(true);
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
} else {
    main();
}
