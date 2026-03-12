import { KnownColor, KNOWN_COLOR_NAMES } from './known_color.js';
import { known_color_to_argb } from './known_color_table.js';

const ARGB_ALPHA_SHIFT = 24;
const ARGB_RED_SHIFT = 16;
const ARGB_GREEN_SHIFT = 8;
const ARGB_BLUE_SHIFT = 0;

export class Color {
    private readonly _argb: number;
    private readonly _known_color: KnownColor | null;
    private readonly _name: string | null;

    private constructor(argb: number, known_color: KnownColor | null = null, name: string | null = null) {
        this._argb = argb;
        this._known_color = known_color;
        this._name = name;
    }

    static from_known_color(color: KnownColor): Color {
        const argb = known_color_to_argb(color);
        return new Color(argb, color, null);
    }

    static from_argb(alpha: number, red: number, green: number, blue: number): Color;
    static from_argb(argb: number): Color;
    static from_argb(alpha_or_argb: number, red?: number, green?: number, blue?: number): Color {
        if (red !== undefined && green !== undefined && blue !== undefined) {
            const argb =
                ((alpha_or_argb & 0xff) << ARGB_ALPHA_SHIFT) |
                ((red & 0xff) << ARGB_RED_SHIFT) |
                ((green & 0xff) << ARGB_GREEN_SHIFT) |
                ((blue & 0xff) << ARGB_BLUE_SHIFT);
            return new Color(argb >>> 0);
        }
        return new Color(alpha_or_argb >>> 0);
    }

    static from_rgb(red: number, green: number, blue: number): Color {
        return Color.from_argb(255, red, green, blue);
    }

    static from_hex(hex: string): Color {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(hex);
        if (!result || !result[1] || !result[2] || !result[3]) {
            return Color.Empty;
        }
        const alpha = result[4] ? parseInt(result[4], 16) : 255;
        const r = parseInt(result[1], 16);
        const g = parseInt(result[2], 16);
        const b = parseInt(result[3], 16);
        return Color.from_argb(alpha, r, g, b);
    }

    static from_name(name: string): Color {
        const upper_name = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
        for (const [key, value] of Object.entries(KNOWN_COLOR_NAMES)) {
            if (value.toLowerCase() === upper_name.toLowerCase()) {
                return Color.from_known_color(parseInt(key) as KnownColor);
            }
        }
        return new Color(0, null, name);
    }

    get a(): number {
        return (this._argb >>> ARGB_ALPHA_SHIFT) & 0xff;
    }

    get r(): number {
        return (this._argb >>> ARGB_RED_SHIFT) & 0xff;
    }

    get g(): number {
        return (this._argb >>> ARGB_GREEN_SHIFT) & 0xff;
    }

    get b(): number {
        return (this._argb >>> ARGB_BLUE_SHIFT) & 0xff;
    }

    get is_empty(): boolean {
        return this._argb === 0 && this._known_color === null && this._name === null;
    }

    get is_known_color(): boolean {
        return this._known_color !== null;
    }

    get is_named_color(): boolean {
        return this._known_color !== null || this._name !== null;
    }

    get name(): string {
        if (this._name !== null) {
            return this._name;
        }
        if (this._known_color !== null) {
            return KNOWN_COLOR_NAMES[this._known_color] ?? 'Unknown';
        }
        return this._argb.toString(16);
    }

    to_argb(): number {
        return this._argb;
    }

    to_hex(): string {
        const r = this.r.toString(16).padStart(2, '0');
        const g = this.g.toString(16).padStart(2, '0');
        const b = this.b.toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
    }

    to_rgba_string(): string {
        return `rgba(${this.r}, ${this.g}, ${this.b}, ${this.a / 255})`;
    }

    get_brightness(): number {
        const max = Math.max(this.r, this.g, this.b);
        const min = Math.min(this.r, this.g, this.b);
        return (max + min) / (255 * 2);
    }

    get_hue(): number {
        if (this.r === this.g && this.g === this.b) {
            return 0;
        }

        const max = Math.max(this.r, this.g, this.b);
        const min = Math.min(this.r, this.g, this.b);
        const delta = max - min;

        let hue: number;
        if (max === this.r) {
            hue = (this.g - this.b) / delta;
        } else if (max === this.g) {
            hue = (this.b - this.r) / delta + 2;
        } else {
            hue = (this.r - this.g) / delta + 4;
        }

        hue *= 60;
        if (hue < 0) {
            hue += 360;
        }

        return hue;
    }

    get_saturation(): number {
        if (this.r === this.g && this.g === this.b) {
            return 0;
        }

        const max = Math.max(this.r, this.g, this.b);
        const min = Math.min(this.r, this.g, this.b);

        const div = max + min > 255 ? 255 * 2 - max - min : max + min;
        return (max - min) / div;
    }

    with_alpha(alpha: number): Color {
        return Color.from_argb(alpha, this.r, this.g, this.b);
    }

    equals(other: Color): boolean {
        return this._argb === other._argb && this._known_color === other._known_color && this._name === other._name;
    }

    to_known_color(): KnownColor | null {
        return this._known_color;
    }

    toString(): string {
        if (this.is_named_color) {
            return `Color [${this.name}]`;
        }
        if (!this.is_empty) {
            return `Color [A=${this.a}, R=${this.r}, G=${this.g}, B=${this.b}]`;
        }
        return 'Color [Empty]';
    }

    static readonly Empty = new Color(0, null, null);

    static readonly Transparent = Color.from_known_color(KnownColor.Transparent);
    static readonly AliceBlue = Color.from_known_color(KnownColor.AliceBlue);
    static readonly AntiqueWhite = Color.from_known_color(KnownColor.AntiqueWhite);
    static readonly Aqua = Color.from_known_color(KnownColor.Aqua);
    static readonly Aquamarine = Color.from_known_color(KnownColor.Aquamarine);
    static readonly Azure = Color.from_known_color(KnownColor.Azure);
    static readonly Beige = Color.from_known_color(KnownColor.Beige);
    static readonly Bisque = Color.from_known_color(KnownColor.Bisque);
    static readonly Black = Color.from_known_color(KnownColor.Black);
    static readonly BlanchedAlmond = Color.from_known_color(KnownColor.BlanchedAlmond);
    static readonly Blue = Color.from_known_color(KnownColor.Blue);
    static readonly BlueViolet = Color.from_known_color(KnownColor.BlueViolet);
    static readonly Brown = Color.from_known_color(KnownColor.Brown);
    static readonly BurlyWood = Color.from_known_color(KnownColor.BurlyWood);
    static readonly CadetBlue = Color.from_known_color(KnownColor.CadetBlue);
    static readonly Chartreuse = Color.from_known_color(KnownColor.Chartreuse);
    static readonly Chocolate = Color.from_known_color(KnownColor.Chocolate);
    static readonly Coral = Color.from_known_color(KnownColor.Coral);
    static readonly CornflowerBlue = Color.from_known_color(KnownColor.CornflowerBlue);
    static readonly Cornsilk = Color.from_known_color(KnownColor.Cornsilk);
    static readonly Crimson = Color.from_known_color(KnownColor.Crimson);
    static readonly Cyan = Color.from_known_color(KnownColor.Cyan);
    static readonly DarkBlue = Color.from_known_color(KnownColor.DarkBlue);
    static readonly DarkCyan = Color.from_known_color(KnownColor.DarkCyan);
    static readonly DarkGoldenrod = Color.from_known_color(KnownColor.DarkGoldenrod);
    static readonly DarkGray = Color.from_known_color(KnownColor.DarkGray);
    static readonly DarkGreen = Color.from_known_color(KnownColor.DarkGreen);
    static readonly DarkKhaki = Color.from_known_color(KnownColor.DarkKhaki);
    static readonly DarkMagenta = Color.from_known_color(KnownColor.DarkMagenta);
    static readonly DarkOliveGreen = Color.from_known_color(KnownColor.DarkOliveGreen);
    static readonly DarkOrange = Color.from_known_color(KnownColor.DarkOrange);
    static readonly DarkOrchid = Color.from_known_color(KnownColor.DarkOrchid);
    static readonly DarkRed = Color.from_known_color(KnownColor.DarkRed);
    static readonly DarkSalmon = Color.from_known_color(KnownColor.DarkSalmon);
    static readonly DarkSeaGreen = Color.from_known_color(KnownColor.DarkSeaGreen);
    static readonly DarkSlateBlue = Color.from_known_color(KnownColor.DarkSlateBlue);
    static readonly DarkSlateGray = Color.from_known_color(KnownColor.DarkSlateGray);
    static readonly DarkTurquoise = Color.from_known_color(KnownColor.DarkTurquoise);
    static readonly DarkViolet = Color.from_known_color(KnownColor.DarkViolet);
    static readonly DeepPink = Color.from_known_color(KnownColor.DeepPink);
    static readonly DeepSkyBlue = Color.from_known_color(KnownColor.DeepSkyBlue);
    static readonly DimGray = Color.from_known_color(KnownColor.DimGray);
    static readonly DodgerBlue = Color.from_known_color(KnownColor.DodgerBlue);
    static readonly Firebrick = Color.from_known_color(KnownColor.Firebrick);
    static readonly FloralWhite = Color.from_known_color(KnownColor.FloralWhite);
    static readonly ForestGreen = Color.from_known_color(KnownColor.ForestGreen);
    static readonly Fuchsia = Color.from_known_color(KnownColor.Fuchsia);
    static readonly Gainsboro = Color.from_known_color(KnownColor.Gainsboro);
    static readonly GhostWhite = Color.from_known_color(KnownColor.GhostWhite);
    static readonly Gold = Color.from_known_color(KnownColor.Gold);
    static readonly Goldenrod = Color.from_known_color(KnownColor.Goldenrod);
    static readonly Gray = Color.from_known_color(KnownColor.Gray);
    static readonly Green = Color.from_known_color(KnownColor.Green);
    static readonly GreenYellow = Color.from_known_color(KnownColor.GreenYellow);
    static readonly Honeydew = Color.from_known_color(KnownColor.Honeydew);
    static readonly HotPink = Color.from_known_color(KnownColor.HotPink);
    static readonly IndianRed = Color.from_known_color(KnownColor.IndianRed);
    static readonly Indigo = Color.from_known_color(KnownColor.Indigo);
    static readonly Ivory = Color.from_known_color(KnownColor.Ivory);
    static readonly Khaki = Color.from_known_color(KnownColor.Khaki);
    static readonly Lavender = Color.from_known_color(KnownColor.Lavender);
    static readonly LavenderBlush = Color.from_known_color(KnownColor.LavenderBlush);
    static readonly LawnGreen = Color.from_known_color(KnownColor.LawnGreen);
    static readonly LemonChiffon = Color.from_known_color(KnownColor.LemonChiffon);
    static readonly LightBlue = Color.from_known_color(KnownColor.LightBlue);
    static readonly LightCoral = Color.from_known_color(KnownColor.LightCoral);
    static readonly LightCyan = Color.from_known_color(KnownColor.LightCyan);
    static readonly LightGoldenrodYellow = Color.from_known_color(KnownColor.LightGoldenrodYellow);
    static readonly LightGray = Color.from_known_color(KnownColor.LightGray);
    static readonly LightGreen = Color.from_known_color(KnownColor.LightGreen);
    static readonly LightPink = Color.from_known_color(KnownColor.LightPink);
    static readonly LightSalmon = Color.from_known_color(KnownColor.LightSalmon);
    static readonly LightSeaGreen = Color.from_known_color(KnownColor.LightSeaGreen);
    static readonly LightSkyBlue = Color.from_known_color(KnownColor.LightSkyBlue);
    static readonly LightSlateGray = Color.from_known_color(KnownColor.LightSlateGray);
    static readonly LightSteelBlue = Color.from_known_color(KnownColor.LightSteelBlue);
    static readonly LightYellow = Color.from_known_color(KnownColor.LightYellow);
    static readonly Lime = Color.from_known_color(KnownColor.Lime);
    static readonly LimeGreen = Color.from_known_color(KnownColor.LimeGreen);
    static readonly Linen = Color.from_known_color(KnownColor.Linen);
    static readonly Magenta = Color.from_known_color(KnownColor.Magenta);
    static readonly Maroon = Color.from_known_color(KnownColor.Maroon);
    static readonly MediumAquamarine = Color.from_known_color(KnownColor.MediumAquamarine);
    static readonly MediumBlue = Color.from_known_color(KnownColor.MediumBlue);
    static readonly MediumOrchid = Color.from_known_color(KnownColor.MediumOrchid);
    static readonly MediumPurple = Color.from_known_color(KnownColor.MediumPurple);
    static readonly MediumSeaGreen = Color.from_known_color(KnownColor.MediumSeaGreen);
    static readonly MediumSlateBlue = Color.from_known_color(KnownColor.MediumSlateBlue);
    static readonly MediumSpringGreen = Color.from_known_color(KnownColor.MediumSpringGreen);
    static readonly MediumTurquoise = Color.from_known_color(KnownColor.MediumTurquoise);
    static readonly MediumVioletRed = Color.from_known_color(KnownColor.MediumVioletRed);
    static readonly MidnightBlue = Color.from_known_color(KnownColor.MidnightBlue);
    static readonly MintCream = Color.from_known_color(KnownColor.MintCream);
    static readonly MistyRose = Color.from_known_color(KnownColor.MistyRose);
    static readonly Moccasin = Color.from_known_color(KnownColor.Moccasin);
    static readonly NavajoWhite = Color.from_known_color(KnownColor.NavajoWhite);
    static readonly Navy = Color.from_known_color(KnownColor.Navy);
    static readonly OldLace = Color.from_known_color(KnownColor.OldLace);
    static readonly Olive = Color.from_known_color(KnownColor.Olive);
    static readonly OliveDrab = Color.from_known_color(KnownColor.OliveDrab);
    static readonly Orange = Color.from_known_color(KnownColor.Orange);
    static readonly OrangeRed = Color.from_known_color(KnownColor.OrangeRed);
    static readonly Orchid = Color.from_known_color(KnownColor.Orchid);
    static readonly PaleGoldenrod = Color.from_known_color(KnownColor.PaleGoldenrod);
    static readonly PaleGreen = Color.from_known_color(KnownColor.PaleGreen);
    static readonly PaleTurquoise = Color.from_known_color(KnownColor.PaleTurquoise);
    static readonly PaleVioletRed = Color.from_known_color(KnownColor.PaleVioletRed);
    static readonly PapayaWhip = Color.from_known_color(KnownColor.PapayaWhip);
    static readonly PeachPuff = Color.from_known_color(KnownColor.PeachPuff);
    static readonly Peru = Color.from_known_color(KnownColor.Peru);
    static readonly Pink = Color.from_known_color(KnownColor.Pink);
    static readonly Plum = Color.from_known_color(KnownColor.Plum);
    static readonly PowderBlue = Color.from_known_color(KnownColor.PowderBlue);
    static readonly Purple = Color.from_known_color(KnownColor.Purple);
    static readonly Red = Color.from_known_color(KnownColor.Red);
    static readonly RosyBrown = Color.from_known_color(KnownColor.RosyBrown);
    static readonly RoyalBlue = Color.from_known_color(KnownColor.RoyalBlue);
    static readonly SaddleBrown = Color.from_known_color(KnownColor.SaddleBrown);
    static readonly Salmon = Color.from_known_color(KnownColor.Salmon);
    static readonly SandyBrown = Color.from_known_color(KnownColor.SandyBrown);
    static readonly SeaGreen = Color.from_known_color(KnownColor.SeaGreen);
    static readonly SeaShell = Color.from_known_color(KnownColor.SeaShell);
    static readonly Sienna = Color.from_known_color(KnownColor.Sienna);
    static readonly Silver = Color.from_known_color(KnownColor.Silver);
    static readonly SkyBlue = Color.from_known_color(KnownColor.SkyBlue);
    static readonly SlateBlue = Color.from_known_color(KnownColor.SlateBlue);
    static readonly SlateGray = Color.from_known_color(KnownColor.SlateGray);
    static readonly Snow = Color.from_known_color(KnownColor.Snow);
    static readonly SpringGreen = Color.from_known_color(KnownColor.SpringGreen);
    static readonly SteelBlue = Color.from_known_color(KnownColor.SteelBlue);
    static readonly Tan = Color.from_known_color(KnownColor.Tan);
    static readonly Teal = Color.from_known_color(KnownColor.Teal);
    static readonly Thistle = Color.from_known_color(KnownColor.Thistle);
    static readonly Tomato = Color.from_known_color(KnownColor.Tomato);
    static readonly Turquoise = Color.from_known_color(KnownColor.Turquoise);
    static readonly Violet = Color.from_known_color(KnownColor.Violet);
    static readonly Wheat = Color.from_known_color(KnownColor.Wheat);
    static readonly White = Color.from_known_color(KnownColor.White);
    static readonly WhiteSmoke = Color.from_known_color(KnownColor.WhiteSmoke);
    static readonly Yellow = Color.from_known_color(KnownColor.Yellow);
    static readonly YellowGreen = Color.from_known_color(KnownColor.YellowGreen);
    static readonly RebeccaPurple = Color.from_known_color(KnownColor.RebeccaPurple);
}
