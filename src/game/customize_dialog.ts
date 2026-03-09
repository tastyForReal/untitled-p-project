import { LevelData } from './json_level_reader.js';
import { GameMode, EndlessConfig, MusicMetadata } from './types.js';

/**
 * Result returned when the player clicks "Play" in the customize dialog.
 */
export interface CustomizeDialogResult {
    game_mode: GameMode;
    endless_config: EndlessConfig | null;
    custom_tps_values: number[];
}

/**
 * Opens the customize level dialog with a two-page flow:
 *  - Page 1: Select game mode
 *  - Page 2: Configure settings for the selected mode
 *
 * Resolves with the chosen game mode and config, or rejects if cancelled.
 */
export function show_customize_dialog(level_data: LevelData): Promise<CustomizeDialogResult> {
    return new Promise((resolve, reject) => {
        const overlay = document.createElement('div');
        overlay.className = 'customize_dialog_overlay';

        const dialog = document.createElement('div');
        dialog.className = 'customize_dialog';

        // =====================================================================
        // Dialog header (title + back button)
        // =====================================================================
        const header = document.createElement('div');
        header.className = 'dialog_header';

        const back_btn = document.createElement('button');
        back_btn.type = 'button';
        back_btn.className = 'dialog_back_button';
        back_btn.textContent = '←';
        back_btn.style.display = 'none';
        header.appendChild(back_btn);

        const title = document.createElement('div');
        title.className = 'customize_dialog_title';
        title.textContent = 'Choose Your Rhythm';
        header.appendChild(title);

        const subtitle = document.createElement('div');
        subtitle.className = 'customize_dialog_subtitle';
        subtitle.textContent = 'Select how you want to experience the beat.';
        dialog.appendChild(header);
        dialog.appendChild(subtitle);

        // =====================================================================
        // Page 1: Mode selection
        // =====================================================================
        const page1 = document.createElement('div');
        page1.className = 'dialog_page';

        const mode_options = document.createElement('div');
        mode_options.className = 'mode_options';

        const one_round_option = create_mode_option(
            'one_round',
            'One Round Only',
            'Play through the level once from start to finish.',
            true,
        );
        const endless_fixed_option = create_mode_option(
            'endless_fixed',
            'Endless Mode (Fixed TPS)',
            'Loop the level with TPS increasing each cycle.',
            false,
        );
        const endless_challenge_option = create_mode_option(
            'endless_challenge',
            'Endless Mode (Challenge)',
            'TPS increases over time. Survive as long as you can!',
            false,
        );

        mode_options.appendChild(one_round_option.element);
        mode_options.appendChild(endless_fixed_option.element);
        mode_options.appendChild(endless_challenge_option.element);
        page1.appendChild(mode_options);

        // Track selected mode
        let selected_mode: string = 'one_round';

        const all_mode_options = [
            { name: 'one_round', option: one_round_option },
            { name: 'endless_fixed', option: endless_fixed_option },
            { name: 'endless_challenge', option: endless_challenge_option },
        ];

        function update_mode_selection(mode_name: string): void {
            selected_mode = mode_name;
            for (const opt of all_mode_options) {
                if (opt.name === mode_name) {
                    opt.option.element.classList.add('selected');
                    opt.option.radio.checked = true;
                } else {
                    opt.option.element.classList.remove('selected');
                    opt.option.radio.checked = false;
                }
            }
        }

        for (const opt of all_mode_options) {
            opt.option.element.addEventListener('click', () => {
                update_mode_selection(opt.name);
            });
        }

        dialog.appendChild(page1);

        // =====================================================================
        // Page 2: Configuration for selected mode
        // =====================================================================
        const page2 = document.createElement('div');
        page2.className = 'dialog_page';
        page2.style.display = 'none';

        // --- Unit Switch (TPS/BPM) ---
        const unit_switch_row = document.createElement('div');
        unit_switch_row.className = 'unit_switch_row';

        const unit_label = document.createElement('label');
        unit_label.className = 'unit_switch';
        const unit_checkbox = document.createElement('input');
        unit_checkbox.type = 'checkbox';
        unit_checkbox.checked = false; // Default is TPS
        unit_label.appendChild(unit_checkbox);
        unit_label.appendChild(document.createTextNode(' Show as BPM'));
        unit_switch_row.appendChild(unit_label);
        page2.appendChild(unit_switch_row);

        // --- One Round / Endless Fixed TPS config (shared layout, separate inputs) ---
        const tps_config = document.createElement('div');
        tps_config.className = 'mode_config_section visible';

        const tps_config_title = document.createElement('div');
        tps_config_title.className = 'config_section_title';
        tps_config_title.textContent = 'Section Pacing';
        tps_config.appendChild(tps_config_title);

        const tps_container = document.createElement('div');
        tps_container.className = 'tps_rows_container';

        const tps_inputs: { input: HTMLInputElement; label: HTMLElement; metadata: MusicMetadata }[] = [];
        for (let i = 0; i < level_data.musics.length; i++) {
            const m = level_data.musics[i];
            if (!m) continue;

            const row = document.createElement('div');
            row.className = 'tps_row';

            const label = document.createElement('span');
            label.className = 'tps_row_label';
            label.textContent = `Section ${i + 1}:`;

            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'tps_row_input';
            input.value = m.tps.toFixed(4);
            input.step = '0.0001';
            input.min = '0.1';
            input.max = '100';
            input.required = true;

            row.appendChild(label);
            row.appendChild(input);
            tps_container.appendChild(row);

            tps_inputs.push({ input, label, metadata: m });
        }

        tps_config.appendChild(tps_container);

        // --- Challenge config ---
        const challenge_config = document.createElement('div');
        challenge_config.className = 'mode_config_section visible';

        const challenge_title = document.createElement('div');
        challenge_title.className = 'config_section_title';
        challenge_title.textContent = 'Challenge Progression';
        challenge_config.appendChild(challenge_title);

        const starting_tps_row = document.createElement('div');
        starting_tps_row.className = 'config_row';
        const starting_tps_label = document.createElement('span');
        starting_tps_label.className = 'config_label';
        starting_tps_label.textContent = 'Starting TPS:';
        const starting_tps_input = document.createElement('input');
        starting_tps_input.type = 'number';
        starting_tps_input.className = 'config_input';
        starting_tps_input.value = '3';
        starting_tps_input.min = '0.5';
        starting_tps_input.max = '20';
        starting_tps_input.step = '0.1';
        starting_tps_input.required = true;
        starting_tps_row.appendChild(starting_tps_label);
        starting_tps_row.appendChild(starting_tps_input);

        const accel_row = document.createElement('div');
        accel_row.className = 'config_row';
        const accel_label = document.createElement('span');
        accel_label.className = 'config_label';
        accel_label.textContent = 'Acceleration (TPS/sec):';
        const accel_input = document.createElement('input');
        accel_input.type = 'number';
        accel_input.className = 'config_input';
        accel_input.value = '0.1';
        accel_input.min = '0.01';
        accel_input.max = '5';
        accel_input.step = '0.01';
        accel_input.required = true;
        accel_row.appendChild(accel_label);
        accel_row.appendChild(accel_input);

        challenge_config.appendChild(starting_tps_row);
        challenge_config.appendChild(accel_row);

        page2.appendChild(tps_config);
        page2.appendChild(challenge_config);

        dialog.appendChild(page2);

        // Handle Unit Switch Toggle logic
        unit_checkbox.addEventListener('change', () => {
            const show_bpm = unit_checkbox.checked;

            // Update Section Rows
            for (const item of tps_inputs) {
                const current_val = parseFloat(item.input.value);
                if (show_bpm) {
                    // Convert TPS to BPM: BPM = TPS * base_beats * 60
                    const bpm = current_val * item.metadata.base_beats * 60;
                    item.input.value = Math.round(bpm).toString();
                    item.label.textContent = `Section ${item.metadata.id + 1} (BPM):`;
                    item.input.step = '1';
                } else {
                    // Convert BPM back to TPS: TPS = BPM / base_beats / 60
                    const tps = current_val / item.metadata.base_beats / 60;
                    item.input.value = tps.toFixed(4);
                    item.label.textContent = `Section ${item.metadata.id + 1}:`;
                    item.input.step = '0.0001';
                }
            }

            // Update Challenge Starting TPS
            const start_val = parseFloat(starting_tps_input.value);
            // Challenge uses first music section's base_beats for conversion
            const first_music = level_data.musics[0];
            const base_beats = first_music ? first_music.base_beats : 1;

            if (show_bpm) {
                const bpm = start_val * base_beats * 60;
                starting_tps_input.value = Math.round(bpm).toString();
                starting_tps_label.textContent = 'Starting BPM:';
                starting_tps_input.step = '1';
            } else {
                const tps = start_val / base_beats / 60;
                starting_tps_input.value = tps.toFixed(1);
                starting_tps_label.textContent = 'Starting TPS:';
                starting_tps_input.step = '0.1';
            }
        });

        // =====================================================================
        // Buttons
        // =====================================================================
        const button_row = document.createElement('div');
        button_row.className = 'dialog_buttons';

        const cancel_btn = document.createElement('button');
        cancel_btn.type = 'button';
        cancel_btn.className = 'dialog_button cancel';
        cancel_btn.textContent = 'Cancel';

        const action_btn = document.createElement('button');
        action_btn.type = 'button';
        action_btn.className = 'dialog_button play';
        action_btn.textContent = 'Next';

        button_row.appendChild(cancel_btn);
        button_row.appendChild(action_btn);
        dialog.appendChild(button_row);

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // =====================================================================
        // Page navigation
        // =====================================================================
        let current_page = 1;

        function show_page(page_num: number): void {
            current_page = page_num;
            if (page_num === 1) {
                page1.style.display = '';
                page2.style.display = 'none';
                back_btn.style.display = 'none';
                action_btn.textContent = 'Next';
                title.textContent = 'Choose Gameplay Mode';
                subtitle.textContent = 'Select how you want to play this level.';
            } else {
                page1.style.display = 'none';
                page2.style.display = '';
                back_btn.style.display = '';
                action_btn.textContent = 'Play';

                // Show the appropriate config for the selected mode
                if (selected_mode === 'endless_challenge') {
                    tps_config.style.display = 'none';
                    challenge_config.style.display = '';
                    title.textContent = 'Survive the Challenge';
                    subtitle.textContent = 'The speed builds over time. How far can you go?';
                } else {
                    tps_config.style.display = '';
                    challenge_config.style.display = 'none';
                    title.textContent = 'Tune the Pacing';
                    subtitle.textContent = 'Fine-tune the speed for each section of the music.';
                }
            }
        }

        back_btn.addEventListener('click', () => {
            show_page(1);
        });

        function cleanup(): void {
            overlay.remove();
        }

        cancel_btn.addEventListener('click', () => {
            cleanup();
            reject(new Error('Dialog cancelled'));
        });

        action_btn.addEventListener('click', () => {
            if (current_page === 1) {
                // Go to page 2
                show_page(2);
                return;
            }

            // Page 2: collect results and resolve
            let game_mode: GameMode;
            let endless_config: EndlessConfig | null = null;
            let custom_tps: number[] = [];
            const is_bpm_mode = unit_checkbox.checked;

            function value_to_tps(val: number, base_beats: number): number {
                if (is_bpm_mode) {
                    // Convert BPM back to TPS
                    return val / base_beats / 60;
                }
                return val;
            }

            if (selected_mode === 'one_round') {
                game_mode = GameMode.ONE_ROUND;
                custom_tps = tps_inputs.map(item =>
                    value_to_tps(parseFloat(item.input.value) || 3, item.metadata.base_beats),
                );
            } else if (selected_mode === 'endless_fixed') {
                game_mode = GameMode.ENDLESS_FIXED;
                custom_tps = tps_inputs.map(item =>
                    value_to_tps(parseFloat(item.input.value) || 3, item.metadata.base_beats),
                );
                endless_config = {
                    mode: GameMode.ENDLESS_FIXED,
                    fixed_tps_values: custom_tps,
                };
            } else {
                game_mode = GameMode.ENDLESS_CHALLENGE;
                const first_music = level_data.musics[0];
                const base_beats = first_music ? first_music.base_beats : 1;
                const starting_tps = value_to_tps(parseFloat(starting_tps_input.value) || 3, base_beats);
                const acceleration_rate = parseFloat(accel_input.value) || 0.1;
                endless_config = {
                    mode: GameMode.ENDLESS_CHALLENGE,
                    starting_tps,
                    acceleration_rate,
                };
            }

            cleanup();
            resolve({
                game_mode,
                endless_config,
                custom_tps_values: custom_tps,
            });
        });
    });
}

/**
 * Helper to create a mode option element with radio button.
 */
function create_mode_option(
    value: string,
    label_text: string,
    description_text: string,
    is_checked: boolean,
): { element: HTMLLabelElement; radio: HTMLInputElement } {
    const label = document.createElement('label');
    label.className = `mode_option${is_checked ? ' selected' : ''}`;
    label.dataset['mode'] = value;

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'game_mode';
    radio.value = value;
    radio.checked = is_checked;

    const content = document.createElement('div');
    content.className = 'mode_option_content';

    const option_label = document.createElement('div');
    option_label.className = 'mode_option_label';
    option_label.textContent = label_text;

    const option_desc = document.createElement('div');
    option_desc.className = 'mode_option_description';
    option_desc.textContent = description_text;

    content.appendChild(option_label);
    content.appendChild(option_desc);
    label.appendChild(radio);
    label.appendChild(content);

    return { element: label, radio };
}
