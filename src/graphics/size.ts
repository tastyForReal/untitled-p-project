export class Size {
    private _width: number;
    private _height: number;

    constructor(width: number = 0, height: number = 0) {
        this._width = width;
        this._height = height;
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

    get is_empty(): boolean {
        return this._width === 0 && this._height === 0;
    }

    static readonly empty = new Size(0, 0);

    static add(a: Size, b: Size): Size {
        return new Size(a.width + b.width, a.height + b.height);
    }

    static subtract(a: Size, b: Size): Size {
        return new Size(a.width - b.width, a.height - b.height);
    }

    static ceil(size: { width: number; height: number }): Size {
        return new Size(Math.ceil(size.width), Math.ceil(size.height));
    }

    static truncate(size: { width: number; height: number }): Size {
        return new Size(size.width | 0, size.height | 0);
    }

    static round(size: { width: number; height: number }): Size {
        return new Size(Math.round(size.width), Math.round(size.height));
    }

    multiply(scalar: number): Size {
        return new Size(this._width * scalar, this._height * scalar);
    }

    divide(scalar: number): Size {
        return new Size(this._width / scalar, this._height / scalar);
    }

    equals(other: Size): boolean {
        return this._width === other._width && this._height === other._height;
    }

    clone(): Size {
        return new Size(this._width, this._height);
    }

    to_point(): { x: number; y: number } {
        return { x: this._width, y: this._height };
    }

    toString(): string {
        return `{Width=${this._width},Height=${this._height}}`;
    }
}
