import { Point } from './point.js';
import { Size } from './size.js';

export class Rectangle {
    private _x: number;
    private _y: number;
    private _width: number;
    private _height: number;

    constructor();
    constructor(x: number, y: number, width: number, height: number);
    constructor(location: Point, size: Size);
    constructor(x_or_location?: number | Point, y_or_size?: number | Size, width?: number, height?: number) {
        if (x_or_location === undefined) {
            this._x = 0;
            this._y = 0;
            this._width = 0;
            this._height = 0;
        } else if (typeof x_or_location === 'object') {
            const location = x_or_location;
            const size = y_or_size as Size;
            this._x = location.x;
            this._y = location.y;
            this._width = size.width;
            this._height = size.height;
        } else {
            this._x = x_or_location;
            this._y = y_or_size as number;
            this._width = width ?? 0;
            this._height = height ?? 0;
        }
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

    get width(): number {
        return this._width;
    }

    set width(value: number) {
        this._width = value;
    }

    get height(): number {
        return this._height;
    }

    set height(value: number) {
        this._height = value;
    }

    get left(): number {
        return this._x;
    }

    get top(): number {
        return this._y;
    }

    get right(): number {
        return this._x + this._width;
    }

    get bottom(): number {
        return this._y + this._height;
    }

    get location(): Point {
        return new Point(this._x, this._y);
    }

    set location(value: Point) {
        this._x = value.x;
        this._y = value.y;
    }

    get size(): Size {
        return new Size(this._width, this._height);
    }

    set size(value: Size) {
        this._width = value.width;
        this._height = value.height;
    }

    get is_empty(): boolean {
        return this._height === 0 && this._width === 0 && this._x === 0 && this._y === 0;
    }

    static readonly empty = new Rectangle(0, 0, 0, 0);

    static from_ltrb(left: number, top: number, right: number, bottom: number): Rectangle {
        return new Rectangle(left, top, right - left, bottom - top);
    }

    static ceil(rect: { x: number; y: number; width: number; height: number }): Rectangle {
        return new Rectangle(Math.ceil(rect.x), Math.ceil(rect.y), Math.ceil(rect.width), Math.ceil(rect.height));
    }

    static truncate(rect: { x: number; y: number; width: number; height: number }): Rectangle {
        return new Rectangle(rect.x | 0, rect.y | 0, rect.width | 0, rect.height | 0);
    }

    static round(rect: { x: number; y: number; width: number; height: number }): Rectangle {
        return new Rectangle(Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), Math.round(rect.height));
    }

    contains(x: number, y: number): boolean;
    contains(point: Point): boolean;
    contains(rect: Rectangle): boolean;
    contains(x_or_point: number | Point | Rectangle, y?: number): boolean {
        if (typeof x_or_point === 'number') {
            return this._x <= x_or_point && x_or_point < this.right && this._y <= (y ?? 0) && (y ?? 0) < this.bottom;
        }
        if (x_or_point instanceof Rectangle) {
            return (
                this._x <= x_or_point.x &&
                x_or_point.right <= this.right &&
                this._y <= x_or_point.y &&
                x_or_point.bottom <= this.bottom
            );
        }
        return (
            this._x <= x_or_point.x &&
            x_or_point.x < this.right &&
            this._y <= x_or_point.y &&
            x_or_point.y < this.bottom
        );
    }

    inflate(width: number, height: number): void;
    inflate(size: Size): void;
    inflate(width_or_size: number | Size, height?: number): void {
        if (typeof width_or_size === 'object') {
            this.inflate(width_or_size.width, width_or_size.height);
            return;
        }
        this._x -= width_or_size;
        this._y -= height ?? width_or_size;
        this._width += 2 * width_or_size;
        this._height += 2 * (height ?? width_or_size);
    }

    static inflate(rect: Rectangle, x: number, y: number): Rectangle {
        const result = rect.clone();
        result.inflate(x, y);
        return result;
    }

    intersect(rect: Rectangle): void {
        const result = Rectangle.intersect_rects(this, rect);
        this._x = result.x;
        this._y = result.y;
        this._width = result.width;
        this._height = result.height;
    }

    static intersect_rects(a: Rectangle, b: Rectangle): Rectangle {
        const x1 = Math.max(a.x, b.x);
        const x2 = Math.min(a.right, b.right);
        const y1 = Math.max(a.y, b.y);
        const y2 = Math.min(a.bottom, b.bottom);

        if (x2 >= x1 && y2 >= y1) {
            return new Rectangle(x1, y1, x2 - x1, y2 - y1);
        }

        return Rectangle.empty;
    }

    intersects(rect: Rectangle): boolean {
        return rect.x < this.right && this.x < rect.right && rect.y < this.bottom && this.y < rect.bottom;
    }

    static union(a: Rectangle, b: Rectangle): Rectangle {
        const x1 = Math.min(a.x, b.x);
        const x2 = Math.max(a.right, b.right);
        const y1 = Math.min(a.y, b.y);
        const y2 = Math.max(a.bottom, b.bottom);

        return new Rectangle(x1, y1, x2 - x1, y2 - y1);
    }

    offset(x: number, y: number): void;
    offset(point: Point): void;
    offset(x_or_point: number | Point, y?: number): void {
        if (typeof x_or_point === 'object') {
            this._x += x_or_point.x;
            this._y += x_or_point.y;
            return;
        }
        this._x += x_or_point;
        this._y += y ?? 0;
    }

    equals(other: Rectangle): boolean {
        return (
            this._x === other.x && this._y === other.y && this._width === other.width && this._height === other.height
        );
    }

    clone(): Rectangle {
        return new Rectangle(this._x, this._y, this._width, this._height);
    }

    toString(): string {
        return `{X=${this._x},Y=${this._y},Width=${this._width},Height=${this._height}}`;
    }
}
