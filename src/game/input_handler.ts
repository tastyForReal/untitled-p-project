import { KEY_SLOT_MAP, InputType, SCREEN_CONFIG } from './types.js';

export type LaneInputCallback = (
    lane_index: number,
    screen_x: number,
    screen_y: number,
    is_down: boolean,
    input_type: InputType,
) => void;
export type ResetCallback = () => void;

export class InputHandler {
    private canvas: HTMLCanvasElement | null = null;
    private on_lane_input: LaneInputCallback | null = null;
    private on_reset: ResetCallback | null = null;

    initialize(canvas: HTMLCanvasElement): void {
        this.canvas = canvas;
        this.setup_mouse_handlers();
        this.setup_keyboard_handlers();
    }

    set_lane_input_callback(callback: LaneInputCallback): void {
        this.on_lane_input = callback;
    }

    set_reset_callback(callback: ResetCallback): void {
        this.on_reset = callback;
    }

    private setup_mouse_handlers(): void {
        if (!this.canvas) {
            return;
        }

        const handle_pointer_event = (event: PointerEvent | MouseEvent | TouchEvent, is_down: boolean) => {
            if (!this.canvas || !this.on_lane_input) {
                return;
            }

            event.preventDefault();

            let client_x: number, client_y: number;
            if (window.TouchEvent && event instanceof TouchEvent) {
                const touch = event.changedTouches[0];
                if (touch) {
                    client_x = touch.clientX;
                    client_y = touch.clientY;
                } else {
                    return;
                }
            } else {
                client_x = (event as MouseEvent).clientX;
                client_y = (event as MouseEvent).clientY;
            }

            const rect = this.canvas.getBoundingClientRect();
            const screen_x = client_x - rect.left;
            const screen_y = client_y - rect.top;

            const column_width = SCREEN_CONFIG.WIDTH / SCREEN_CONFIG.COLUMN_COUNT;
            const lane_index = Math.floor(screen_x / column_width);

            if (lane_index < 0 || lane_index >= SCREEN_CONFIG.COLUMN_COUNT) return;

            this.on_lane_input(lane_index, screen_x, screen_y, is_down, InputType.Mouse);
        };

        this.canvas.addEventListener('mousedown', e => handle_pointer_event(e, true));
        this.canvas.addEventListener('touchstart', e => handle_pointer_event(e, true), { passive: false });
        window.addEventListener('mouseup', e => handle_pointer_event(e, false));
        window.addEventListener('touchend', e => handle_pointer_event(e, false), { passive: false });
    }

    private setup_keyboard_handlers(): void {
        document.addEventListener('keydown', (event: KeyboardEvent) => {
            const key = event.key;

            if (key === 'r' || key === 'R') {
                event.preventDefault();
                if (this.on_reset) {
                    this.on_reset();
                }
                return;
            }

            if (key in KEY_SLOT_MAP) {
                event.preventDefault();
                if (event.repeat) return;
                const lane_index = KEY_SLOT_MAP[key];
                if (lane_index !== undefined && this.on_lane_input) {
                    const column_width = SCREEN_CONFIG.WIDTH / SCREEN_CONFIG.COLUMN_COUNT;
                    const screen_x = lane_index * column_width + column_width / 2;
                    const screen_y = SCREEN_CONFIG.HEIGHT / 2;

                    this.on_lane_input(lane_index, screen_x, screen_y, true, InputType.Keyboard);
                }
            }
        });

        document.addEventListener('keyup', (event: KeyboardEvent) => {
            const key = event.key;
            if (key in KEY_SLOT_MAP) {
                event.preventDefault();
                const lane_index = KEY_SLOT_MAP[key];
                if (lane_index !== undefined && this.on_lane_input) {
                    const column_width = SCREEN_CONFIG.WIDTH / SCREEN_CONFIG.COLUMN_COUNT;
                    const screen_x = lane_index * column_width + column_width / 2;
                    const screen_y = SCREEN_CONFIG.HEIGHT / 2;

                    this.on_lane_input(lane_index, screen_x, screen_y, false, InputType.Keyboard);
                }
            }
        });
    }

    cleanup(): void {
        this.canvas = null;
    }
}
