export class Vector2 {
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

    static readonly zero = new Vector2(0, 0);
    static readonly one = new Vector2(1, 1);
    static readonly unit_x = new Vector2(1, 0);
    static readonly unit_y = new Vector2(0, 1);

    static create(value: number): Vector2;
    static create(x: number, y: number): Vector2;
    static create(x_or_value: number, y?: number): Vector2 {
        if (y === undefined) {
            return new Vector2(x_or_value, x_or_value);
        }
        return new Vector2(x_or_value, y);
    }

    static add(left: Vector2, right: Vector2): Vector2 {
        return new Vector2(left.x + right.x, left.y + right.y);
    }

    static subtract(left: Vector2, right: Vector2): Vector2 {
        return new Vector2(left.x - right.x, left.y - right.y);
    }

    static multiply(left: Vector2, right: Vector2): Vector2;
    static multiply(vector: Vector2, scalar: number): Vector2;
    static multiply(left: Vector2, right: Vector2 | number): Vector2 {
        if (typeof right === 'number') {
            return new Vector2(left.x * right, left.y * right);
        }
        return new Vector2(left.x * right.x, left.y * right.y);
    }

    static divide(left: Vector2, right: Vector2): Vector2;
    static divide(vector: Vector2, scalar: number): Vector2;
    static divide(left: Vector2, right: Vector2 | number): Vector2 {
        if (typeof right === 'number') {
            return new Vector2(left.x / right, left.y / right);
        }
        return new Vector2(left.x / right.x, left.y / right.y);
    }

    static negate(value: Vector2): Vector2 {
        return new Vector2(-value.x, -value.y);
    }

    static abs(value: Vector2): Vector2 {
        return new Vector2(Math.abs(value.x), Math.abs(value.y));
    }

    static sqrt(value: Vector2): Vector2 {
        return new Vector2(Math.sqrt(value.x), Math.sqrt(value.y));
    }

    static dot(left: Vector2, right: Vector2): number {
        return left.x * right.x + left.y * right.y;
    }

    static cross(left: Vector2, right: Vector2): number {
        return left.x * right.y - left.y * right.x;
    }

    static distance(value1: Vector2, value2: Vector2): number {
        return Math.sqrt(Vector2.distance_squared(value1, value2));
    }

    static distance_squared(value1: Vector2, value2: Vector2): number {
        const dx = value1.x - value2.x;
        const dy = value1.y - value2.y;
        return dx * dx + dy * dy;
    }

    static lerp(value1: Vector2, value2: Vector2, amount: number): Vector2 {
        return new Vector2(value1.x + (value2.x - value1.x) * amount, value1.y + (value2.y - value1.y) * amount);
    }

    static min(value1: Vector2, value2: Vector2): Vector2 {
        return new Vector2(Math.min(value1.x, value2.x), Math.min(value1.y, value2.y));
    }

    static max(value1: Vector2, value2: Vector2): Vector2 {
        return new Vector2(Math.max(value1.x, value2.x), Math.max(value1.y, value2.y));
    }

    static clamp(value: Vector2, min: Vector2, max: Vector2): Vector2 {
        return new Vector2(Math.max(min.x, Math.min(max.x, value.x)), Math.max(min.y, Math.min(max.y, value.y)));
    }

    static reflect(vector: Vector2, normal: Vector2): Vector2 {
        const dot = Vector2.dot(vector, normal);
        return new Vector2(vector.x - 2 * dot * normal.x, vector.y - 2 * dot * normal.y);
    }

    static normalize(value: Vector2): Vector2 {
        const length = value.length();
        if (length === 0) {
            return Vector2.zero;
        }
        const inverse_length = 1 / length;
        return new Vector2(value.x * inverse_length, value.y * inverse_length);
    }

    static transform(vector: Vector2, matrix: { m11: number; m12: number; m21: number; m22: number }): Vector2 {
        return new Vector2(
            vector.x * matrix.m11 + vector.y * matrix.m21,
            vector.x * matrix.m12 + vector.y * matrix.m22,
        );
    }

    length(): number {
        return Math.sqrt(this._x * this._x + this._y * this._y);
    }

    length_squared(): number {
        return this._x * this._x + this._y * this._y;
    }

    normalize(): void {
        const length = this.length();
        if (length > 0) {
            const inverse_length = 1 / length;
            this._x *= inverse_length;
            this._y *= inverse_length;
        }
    }

    negate(): void {
        this._x = -this._x;
        this._y = -this._y;
    }

    add(other: Vector2): void {
        this._x += other.x;
        this._y += other.y;
    }

    subtract(other: Vector2): void {
        this._x -= other.x;
        this._y -= other.y;
    }

    multiply(scalar: number): void {
        this._x *= scalar;
        this._y *= scalar;
    }

    divide(scalar: number): void {
        this._x /= scalar;
        this._y /= scalar;
    }

    copy_to(array: number[], index: number = 0): void {
        array[index] = this._x;
        array[index + 1] = this._y;
    }

    static from_array(array: number[], index: number = 0): Vector2 {
        return new Vector2(array[index] ?? 0, array[index + 1] ?? 0);
    }

    equals(other: Vector2): boolean {
        return this._x === other.x && this._y === other.y;
    }

    equals_with_tolerance(other: Vector2, tolerance: number = 1e-6): boolean {
        return Math.abs(this._x - other.x) < tolerance && Math.abs(this._y - other.y) < tolerance;
    }

    clone(): Vector2 {
        return new Vector2(this._x, this._y);
    }

    toString(): string {
        return `{X=${this._x},Y=${this._y}}`;
    }
}
