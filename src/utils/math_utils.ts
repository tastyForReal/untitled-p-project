export function random_int(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function random_float(min: number, max: number): number {
    return Math.random() * (max - min) + min;
}

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function lerp(start: number, end: number, t: number): number {
    return start + (end - start) * t;
}

export function hex_to_rgba(hex: string): [number, number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) {
        return [0, 0, 0, 1];
    }
    const r = result[1];
    const g = result[2];
    const b = result[3];
    if (!r || !g || !b) {
        return [0, 0, 0, 1];
    }
    return [parseInt(r, 16) / 255, parseInt(g, 16) / 255, parseInt(b, 16) / 255, 1.0];
}

export function hex_to_rgba_with_alpha(hex: string, alpha: number): [number, number, number, number] {
    const [r, g, b, _] = hex_to_rgba(hex);
    return [r, g, b, alpha];
}

export function point_in_rect(
    point_x: number,
    point_y: number,
    rect_x: number,
    rect_y: number,
    rect_width: number,
    rect_height: number,
): boolean {
    return point_x >= rect_x && point_x <= rect_x + rect_width && point_y >= rect_y && point_y <= rect_y + rect_height;
}

export function ease_out_quad(t: number): number {
    return t * (2 - t);
}

export function ease_in_out_quad(t: number): number {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export function distance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}
