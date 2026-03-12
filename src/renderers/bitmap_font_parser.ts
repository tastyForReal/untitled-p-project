export interface BitmapFontCharacter {
    id: number;
    x: number;
    y: number;
    width: number;
    height: number;
    x_offset: number;
    y_offset: number;
    x_advance: number;
    page: number;
}

export interface BitmapFontCommon {
    line_height: number;
    base: number;
    scale_w: number;
    scale_h: number;
    pages: number;
}

export interface BitmapFontInfo {
    face: string;
    size: number;
    bold: number;
    italic: number;
}

export interface BitmapFontData {
    info: BitmapFontInfo;
    common: BitmapFontCommon;
    chars: Map<number, BitmapFontCharacter>;
    page_file: string;
}

export function parse_bitmap_font(fnt_content: string): BitmapFontData {
    const lines = fnt_content.split('\n');

    let info: BitmapFontInfo = { face: '', size: 0, bold: 0, italic: 0 };
    let common: BitmapFontCommon = { line_height: 0, base: 0, scale_w: 0, scale_h: 0, pages: 0 };
    const chars = new Map<number, BitmapFontCharacter>();
    let page_file = '';

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('info ')) {
            info = parse_info_line(trimmed);
        } else if (trimmed.startsWith('common ')) {
            common = parse_common_line(trimmed);
        } else if (trimmed.startsWith('page ')) {
            page_file = parse_page_line(trimmed);
        } else if (trimmed.startsWith('char ')) {
            const char_data = parse_char_line(trimmed);
            chars.set(char_data.id, char_data);
        }
    }

    return { info, common, chars, page_file };
}

function parse_info_line(line: string): BitmapFontInfo {
    return {
        face: extract_string_value(line, 'face'),
        size: extract_number_value(line, 'size'),
        bold: extract_number_value(line, 'bold'),
        italic: extract_number_value(line, 'italic'),
    };
}

function parse_common_line(line: string): BitmapFontCommon {
    return {
        line_height: extract_number_value(line, 'lineHeight'),
        base: extract_number_value(line, 'base'),
        scale_w: extract_number_value(line, 'scaleW'),
        scale_h: extract_number_value(line, 'scaleH'),
        pages: extract_number_value(line, 'pages'),
    };
}

function parse_page_line(line: string): string {
    return extract_string_value(line, 'file');
}

function parse_char_line(line: string): BitmapFontCharacter {
    return {
        id: extract_number_value(line, 'id'),
        x: extract_number_value(line, 'x'),
        y: extract_number_value(line, 'y'),
        width: extract_number_value(line, 'width'),
        height: extract_number_value(line, 'height'),
        x_offset: extract_number_value(line, 'xoffset'),
        y_offset: extract_number_value(line, 'yoffset'),
        x_advance: extract_number_value(line, 'xadvance'),
        page: extract_number_value(line, 'page'),
    };
}

function extract_string_value(line: string, key: string): string {
    const pattern = new RegExp(`${key}="([^"]*)"`);
    const match = line.match(pattern);
    return match?.[1] ?? '';
}

function extract_number_value(line: string, key: string): number {
    const pattern = new RegExp(`${key}=(-?\\d+)`);
    const match = line.match(pattern);
    return match?.[1] ? parseInt(match[1], 10) : 0;
}

export function calculate_text_width(text: string, font_data: BitmapFontData, scale: number = 1.0): number {
    let width = 0;
    for (const char of text) {
        const char_code = char.charCodeAt(0);
        const char_info = font_data.chars.get(char_code);
        if (char_info) {
            width += char_info.x_advance * scale;
        }
    }
    return width;
}

export function calculate_scale_for_width(text: string, font_data: BitmapFontData, target_width: number): number {
    const original_width = calculate_text_width(text, font_data, 1.0);
    if (original_width === 0) return 1.0;
    return target_width / original_width;
}
