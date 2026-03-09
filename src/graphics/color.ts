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
            return Color.empty;
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

    static readonly empty = new Color(0, null, null);

    static readonly transparent = Color.from_known_color(KnownColor.Transparent);
    static readonly alice_blue = Color.from_known_color(KnownColor.AliceBlue);
    static readonly antique_white = Color.from_known_color(KnownColor.AntiqueWhite);
    static readonly aqua = Color.from_known_color(KnownColor.Aqua);
    static readonly aquamarine = Color.from_known_color(KnownColor.Aquamarine);
    static readonly azure = Color.from_known_color(KnownColor.Azure);
    static readonly beige = Color.from_known_color(KnownColor.Beige);
    static readonly bisque = Color.from_known_color(KnownColor.Bisque);
    static readonly black = Color.from_known_color(KnownColor.Black);
    static readonly blanched_almond = Color.from_known_color(KnownColor.BlanchedAlmond);
    static readonly blue = Color.from_known_color(KnownColor.Blue);
    static readonly blue_violet = Color.from_known_color(KnownColor.BlueViolet);
    static readonly brown = Color.from_known_color(KnownColor.Brown);
    static readonly burly_wood = Color.from_known_color(KnownColor.BurlyWood);
    static readonly cadet_blue = Color.from_known_color(KnownColor.CadetBlue);
    static readonly chartreuse = Color.from_known_color(KnownColor.Chartreuse);
    static readonly chocolate = Color.from_known_color(KnownColor.Chocolate);
    static readonly coral = Color.from_known_color(KnownColor.Coral);
    static readonly cornflower_blue = Color.from_known_color(KnownColor.CornflowerBlue);
    static readonly cornsilk = Color.from_known_color(KnownColor.Cornsilk);
    static readonly crimson = Color.from_known_color(KnownColor.Crimson);
    static readonly cyan = Color.from_known_color(KnownColor.Cyan);
    static readonly dark_blue = Color.from_known_color(KnownColor.DarkBlue);
    static readonly dark_cyan = Color.from_known_color(KnownColor.DarkCyan);
    static readonly dark_goldenrod = Color.from_known_color(KnownColor.DarkGoldenrod);
    static readonly dark_gray = Color.from_known_color(KnownColor.DarkGray);
    static readonly dark_green = Color.from_known_color(KnownColor.DarkGreen);
    static readonly dark_khaki = Color.from_known_color(KnownColor.DarkKhaki);
    static readonly dark_magenta = Color.from_known_color(KnownColor.DarkMagenta);
    static readonly dark_olive_green = Color.from_known_color(KnownColor.DarkOliveGreen);
    static readonly dark_orange = Color.from_known_color(KnownColor.DarkOrange);
    static readonly dark_orchid = Color.from_known_color(KnownColor.DarkOrchid);
    static readonly dark_red = Color.from_known_color(KnownColor.DarkRed);
    static readonly dark_salmon = Color.from_known_color(KnownColor.DarkSalmon);
    static readonly dark_sea_green = Color.from_known_color(KnownColor.DarkSeaGreen);
    static readonly dark_slate_blue = Color.from_known_color(KnownColor.DarkSlateBlue);
    static readonly dark_slate_gray = Color.from_known_color(KnownColor.DarkSlateGray);
    static readonly dark_turquoise = Color.from_known_color(KnownColor.DarkTurquoise);
    static readonly dark_violet = Color.from_known_color(KnownColor.DarkViolet);
    static readonly deep_pink = Color.from_known_color(KnownColor.DeepPink);
    static readonly deep_sky_blue = Color.from_known_color(KnownColor.DeepSkyBlue);
    static readonly dim_gray = Color.from_known_color(KnownColor.DimGray);
    static readonly dodger_blue = Color.from_known_color(KnownColor.DodgerBlue);
    static readonly firebrick = Color.from_known_color(KnownColor.Firebrick);
    static readonly floral_white = Color.from_known_color(KnownColor.FloralWhite);
    static readonly forest_green = Color.from_known_color(KnownColor.ForestGreen);
    static readonly fuchsia = Color.from_known_color(KnownColor.Fuchsia);
    static readonly gainsboro = Color.from_known_color(KnownColor.Gainsboro);
    static readonly ghost_white = Color.from_known_color(KnownColor.GhostWhite);
    static readonly gold = Color.from_known_color(KnownColor.Gold);
    static readonly goldenrod = Color.from_known_color(KnownColor.Goldenrod);
    static readonly gray = Color.from_known_color(KnownColor.Gray);
    static readonly green = Color.from_known_color(KnownColor.Green);
    static readonly green_yellow = Color.from_known_color(KnownColor.GreenYellow);
    static readonly honeydew = Color.from_known_color(KnownColor.Honeydew);
    static readonly hot_pink = Color.from_known_color(KnownColor.HotPink);
    static readonly indian_red = Color.from_known_color(KnownColor.IndianRed);
    static readonly indigo = Color.from_known_color(KnownColor.Indigo);
    static readonly ivory = Color.from_known_color(KnownColor.Ivory);
    static readonly khaki = Color.from_known_color(KnownColor.Khaki);
    static readonly lavender = Color.from_known_color(KnownColor.Lavender);
    static readonly lavender_blush = Color.from_known_color(KnownColor.LavenderBlush);
    static readonly lawn_green = Color.from_known_color(KnownColor.LawnGreen);
    static readonly lemon_chiffon = Color.from_known_color(KnownColor.LemonChiffon);
    static readonly light_blue = Color.from_known_color(KnownColor.LightBlue);
    static readonly light_coral = Color.from_known_color(KnownColor.LightCoral);
    static readonly light_cyan = Color.from_known_color(KnownColor.LightCyan);
    static readonly light_goldenrod_yellow = Color.from_known_color(KnownColor.LightGoldenrodYellow);
    static readonly light_gray = Color.from_known_color(KnownColor.LightGray);
    static readonly light_green = Color.from_known_color(KnownColor.LightGreen);
    static readonly light_pink = Color.from_known_color(KnownColor.LightPink);
    static readonly light_salmon = Color.from_known_color(KnownColor.LightSalmon);
    static readonly light_sea_green = Color.from_known_color(KnownColor.LightSeaGreen);
    static readonly light_sky_blue = Color.from_known_color(KnownColor.LightSkyBlue);
    static readonly light_slate_gray = Color.from_known_color(KnownColor.LightSlateGray);
    static readonly light_steel_blue = Color.from_known_color(KnownColor.LightSteelBlue);
    static readonly light_yellow = Color.from_known_color(KnownColor.LightYellow);
    static readonly lime = Color.from_known_color(KnownColor.Lime);
    static readonly lime_green = Color.from_known_color(KnownColor.LimeGreen);
    static readonly linen = Color.from_known_color(KnownColor.Linen);
    static readonly magenta = Color.from_known_color(KnownColor.Magenta);
    static readonly maroon = Color.from_known_color(KnownColor.Maroon);
    static readonly medium_aquamarine = Color.from_known_color(KnownColor.MediumAquamarine);
    static readonly medium_blue = Color.from_known_color(KnownColor.MediumBlue);
    static readonly medium_orchid = Color.from_known_color(KnownColor.MediumOrchid);
    static readonly medium_purple = Color.from_known_color(KnownColor.MediumPurple);
    static readonly medium_sea_green = Color.from_known_color(KnownColor.MediumSeaGreen);
    static readonly medium_slate_blue = Color.from_known_color(KnownColor.MediumSlateBlue);
    static readonly medium_spring_green = Color.from_known_color(KnownColor.MediumSpringGreen);
    static readonly medium_turquoise = Color.from_known_color(KnownColor.MediumTurquoise);
    static readonly medium_violet_red = Color.from_known_color(KnownColor.MediumVioletRed);
    static readonly midnight_blue = Color.from_known_color(KnownColor.MidnightBlue);
    static readonly mint_cream = Color.from_known_color(KnownColor.MintCream);
    static readonly misty_rose = Color.from_known_color(KnownColor.MistyRose);
    static readonly moccasin = Color.from_known_color(KnownColor.Moccasin);
    static readonly navajo_white = Color.from_known_color(KnownColor.NavajoWhite);
    static readonly navy = Color.from_known_color(KnownColor.Navy);
    static readonly old_lace = Color.from_known_color(KnownColor.OldLace);
    static readonly olive = Color.from_known_color(KnownColor.Olive);
    static readonly olive_drab = Color.from_known_color(KnownColor.OliveDrab);
    static readonly orange = Color.from_known_color(KnownColor.Orange);
    static readonly orange_red = Color.from_known_color(KnownColor.OrangeRed);
    static readonly orchid = Color.from_known_color(KnownColor.Orchid);
    static readonly pale_goldenrod = Color.from_known_color(KnownColor.PaleGoldenrod);
    static readonly pale_green = Color.from_known_color(KnownColor.PaleGreen);
    static readonly pale_turquoise = Color.from_known_color(KnownColor.PaleTurquoise);
    static readonly pale_violet_red = Color.from_known_color(KnownColor.PaleVioletRed);
    static readonly papaya_whip = Color.from_known_color(KnownColor.PapayaWhip);
    static readonly peach_puff = Color.from_known_color(KnownColor.PeachPuff);
    static readonly peru = Color.from_known_color(KnownColor.Peru);
    static readonly pink = Color.from_known_color(KnownColor.Pink);
    static readonly plum = Color.from_known_color(KnownColor.Plum);
    static readonly powder_blue = Color.from_known_color(KnownColor.PowderBlue);
    static readonly purple = Color.from_known_color(KnownColor.Purple);
    static readonly red = Color.from_known_color(KnownColor.Red);
    static readonly rosy_brown = Color.from_known_color(KnownColor.RosyBrown);
    static readonly royal_blue = Color.from_known_color(KnownColor.RoyalBlue);
    static readonly saddle_brown = Color.from_known_color(KnownColor.SaddleBrown);
    static readonly salmon = Color.from_known_color(KnownColor.Salmon);
    static readonly sandy_brown = Color.from_known_color(KnownColor.SandyBrown);
    static readonly sea_green = Color.from_known_color(KnownColor.SeaGreen);
    static readonly sea_shell = Color.from_known_color(KnownColor.SeaShell);
    static readonly sienna = Color.from_known_color(KnownColor.Sienna);
    static readonly silver = Color.from_known_color(KnownColor.Silver);
    static readonly sky_blue = Color.from_known_color(KnownColor.SkyBlue);
    static readonly slate_blue = Color.from_known_color(KnownColor.SlateBlue);
    static readonly slate_gray = Color.from_known_color(KnownColor.SlateGray);
    static readonly snow = Color.from_known_color(KnownColor.Snow);
    static readonly spring_green = Color.from_known_color(KnownColor.SpringGreen);
    static readonly steel_blue = Color.from_known_color(KnownColor.SteelBlue);
    static readonly tan = Color.from_known_color(KnownColor.Tan);
    static readonly teal = Color.from_known_color(KnownColor.Teal);
    static readonly thistle = Color.from_known_color(KnownColor.Thistle);
    static readonly tomato = Color.from_known_color(KnownColor.Tomato);
    static readonly turquoise = Color.from_known_color(KnownColor.Turquoise);
    static readonly violet = Color.from_known_color(KnownColor.Violet);
    static readonly wheat = Color.from_known_color(KnownColor.Wheat);
    static readonly white = Color.from_known_color(KnownColor.White);
    static readonly white_smoke = Color.from_known_color(KnownColor.WhiteSmoke);
    static readonly yellow = Color.from_known_color(KnownColor.Yellow);
    static readonly yellow_green = Color.from_known_color(KnownColor.YellowGreen);
    static readonly rebecca_purple = Color.from_known_color(KnownColor.RebeccaPurple);
}
