export interface IntRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface IntPoint {
    x: number;
    y: number;
}

export interface SpriteFrame {
    frame: IntRect;
    offset: IntPoint;
    rotated: boolean;
    source_color_rect: IntRect;
    source_size: IntPoint;
}

export interface SpritesheetData {
    frames: Record<string, SpriteFrame>;
    meta: {
        image: string;
        size: IntPoint;
    };
}

function parse_vec2(str: string): IntPoint {
    const match = str.match(/{(-?\d+),(-?\d+)}/);
    if (match) {
        return { x: parseInt(match[1]!, 10), y: parseInt(match[2]!, 10) };
    }
    return { x: 0, y: 0 };
}

function parse_rect(str: string): IntRect {
    const match = str.match(/{{(-?\d+),(-?\d+)},{(-?\d+),(-?\d+)}}/);
    if (match) {
        return {
            x: parseInt(match[1]!, 10),
            y: parseInt(match[2]!, 10),
            w: parseInt(match[3]!, 10),
            h: parseInt(match[4]!, 10),
        };
    }
    return { x: 0, y: 0, w: 0, h: 0 };
}

export function parse_spritesheet(plist_content: string): SpritesheetData {
    const parser = new DOMParser();
    const doc = parser.parseFromString(plist_content, 'text/xml');

    const root_dict = doc.documentElement.querySelector('dict');
    if (!root_dict) throw new Error('Invalid plist');

    const child_elements = Array.from(root_dict.children);

    let frames_dict: Element | null = null;
    let metadata_dict: Element | null = null;

    for (let i = 0; i < child_elements.length; i++) {
        const el = child_elements[i]!;
        if (el.tagName.toLowerCase() === 'key') {
            const key_name = el.textContent?.trim();
            if (key_name === 'frames') {
                frames_dict = child_elements[i + 1] as Element;
            } else if (key_name === 'metadata') {
                metadata_dict = child_elements[i + 1] as Element;
            }
        }
    }

    const frames: Record<string, SpriteFrame> = {};

    if (frames_dict && frames_dict.tagName.toLowerCase() === 'dict') {
        const keys = Array.from(frames_dict.querySelectorAll(':scope > key'));
        const dicts = Array.from(frames_dict.children).filter(el => el.tagName.toLowerCase() === 'dict');

        for (let i = 0; i < keys.length; i++) {
            const name = keys[i]!.textContent!.trim();
            const dict = dicts[i] as Element;
            if (!dict) continue;

            const frame: any = {};
            const child_elements = Array.from(dict.children);

            for (let j = 0; j < child_elements.length; j++) {
                const el = child_elements[j]!;
                if (el.tagName.toLowerCase() === 'key') {
                    const k = el.textContent?.trim();
                    const v = child_elements[j + 1];
                    if (!v) continue;

                    if (k === 'frame' || k === 'textureRect') frame.frame = parse_rect(v.textContent!);
                    else if (k === 'offset' || k === 'spriteOffset') frame.offset = parse_vec2(v.textContent!);
                    else if (k === 'rotated' || k === 'textureRotated') {
                        frame._raw_rotated = v.tagName.toLowerCase() === 'true';
                    } else if (k === 'sourceColorRect') frame.source_color_rect = parse_rect(v.textContent!);
                    else if (k === 'sourceSize' || k === 'spriteSize' || k === 'spriteSourceSize')
                        frame.source_size = parse_vec2(v.textContent!);
                }
            }

            // In this plist format, 'rotated' means the sprite is rotated 90 degrees CW in the atlas.
            // When rotated, we must swap the atlas dimensions (frame.frame.w/h) to correctly
            // reflect the area in the texture, and mark it as rotated for UV calculation.
            if (frame._raw_rotated && frame.frame) {
                const tmp = frame.frame.w;
                frame.frame.w = frame.frame.h;
                frame.frame.h = tmp;
                frame.rotated = true;
            } else {
                frame.rotated = false;
            }

            if (!frame.source_color_rect && frame.frame) {
                frame.source_color_rect = { x: 0, y: 0, w: frame.frame.w, h: frame.frame.h };
            }
            if (!frame.source_size && frame.frame) {
                frame.source_size = { x: frame.frame.w, y: frame.frame.h };
            }

            frames[name] = frame as SpriteFrame;
        }
    }

    const meta: any = { size: { x: 1024, y: 1024 } };
    if (metadata_dict && metadata_dict.tagName.toLowerCase() === 'dict') {
        const metadata_children = Array.from(metadata_dict.children);
        for (let j = 0; j < metadata_children.length; j++) {
            const el = metadata_children[j]!;
            if (el.tagName.toLowerCase() === 'key') {
                const k = el.textContent?.trim();
                const v = metadata_children[j + 1];
                if (!v) continue;

                if (k === 'textureFileName' || k === 'realTextureFileName') {
                    meta.image = v.textContent?.trim();
                } else if (k === 'size') {
                    meta.size = parse_vec2(v.textContent!);
                }
            }
        }
    }

    console.log(
        `[Spritesheet] Parsed ${Object.keys(frames).length} frames. Image: ${meta.image}, Size: ${meta.size.x}x${meta.size.y}`,
    );
    return { frames, meta: meta as any };
}
