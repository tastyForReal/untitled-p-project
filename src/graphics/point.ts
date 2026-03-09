export class Point {
    private _x: number;
    private _y: number;

    constructor(x: number = 0, y: number = 0) {
        this._x = x;
        this._y = y;
    }

    get x(): number {
        return this._x;
    }

    set x(value: number) {
        this._x = value;
    }

    get y(): number {
        return this._y;
    }

    set y(value: number) {
        this._y = value;
    }

    get is_empty(): boolean {
        return this._x === 0 && this._y === 0;
    }

    static readonly empty = new Point(0, 0);

    static add(point: Point, size: { width: number; height: number }): Point {
        return new Point(point.x + size.width, point.y + size.height);
    }

    static subtract(point: Point, size: { width: number; height: number }): Point {
        return new Point(point.x - size.width, point.y - size.height);
    }

    static ceil(point: { x: number; y: number }): Point {
        return new Point(Math.ceil(point.x), Math.ceil(point.y));
    }

    static truncate(point: { x: number; y: number }): Point {
        return new Point(point.x | 0, point.y | 0);
    }

    static round(point: { x: number; y: number }): Point {
        return new Point(Math.round(point.x), Math.round(point.y));
    }

    offset(dx: number, dy: number): void {
        this._x += dx;
        this._y += dy;
    }

    offset_point(point: Point): void {
        this.offset(point.x, point.y);
    }

    equals(other: Point): boolean {
        return this._x === other._x && this._y === other._y;
    }

    clone(): Point {
        return new Point(this._x, this._y);
    }

    to_size(): { width: number; height: number } {
        return { width: this._x, height: this._y };
    }

    toString(): string {
        return `{X=${this._x},Y=${this._y}}`;
    }
}
