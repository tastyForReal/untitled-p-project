import { log_message, log_warning } from '../game/logger.js';
import { GPUContext } from './gpu_context.js';
import { BitmapFontRenderer } from './bitmap_font_renderer.js';
import { RowData, TileData, ParticleData, SCREEN_CONFIG, RowType } from '../game/types.js';
import { NoteIndicatorData } from '../game/note_indicator.js';
import { ScoreData } from '../game/score_types.js';
import { ScoreRenderer } from '../game/score_renderer.js';
import { SpriteRenderer } from './sprite_renderer.js';
import { Color } from '../graphics/color.js';

interface RectangleVertex {
    position: [number, number];
    color: [number, number, number, number];
}

const COLOR_INV = 1 / 255;

function color_to_rgba(color: Color, opacity: number = 1.0): [number, number, number, number] {
    return [color.r * COLOR_INV, color.g * COLOR_INV, color.b * COLOR_INV, opacity];
}

const GRID_LINE_COLOR: [number, number, number, number] = [0, 0, 0, 1];
const NOTE_INDICATOR_COLOR: [number, number, number, number] = [1, 0, 0, 1];
const WHITE_COLOR: [number, number, number, number] = [1, 1, 1, 1];

const COLUMN_WIDTH = SCREEN_CONFIG.WIDTH / SCREEN_CONFIG.COLUMN_COUNT;
const GRID_LINE_POSITIONS = [COLUMN_WIDTH, COLUMN_WIDTH * 2, COLUMN_WIDTH * 3];

const VERTEX_STRIDE = 6;
const VERTEX_SIZE = 24;

const FADE_DURATION = 300;
const DOT_DURATION = 300;
const PEAK_TIME = 50;
const CIRCLE_DURATION = 300;
const ANIM_FRAME_TIME = 1000 / 30;

export class Renderer {
    private gpu_context: GPUContext;
    private font_renderer: BitmapFontRenderer;
    private tile_pipeline: GPURenderPipeline | null = null;
    private vertex_buffer: GPUBuffer | null = null;
    private uniform_buffer: GPUBuffer | null = null;
    private bind_group: GPUBindGroup | null = null;
    private bind_group_layout: GPUBindGroupLayout | null = null;
    private sprite_renderer: SpriteRenderer;

    constructor(gpu_context: GPUContext) {
        this.gpu_context = gpu_context;
        this.font_renderer = new BitmapFontRenderer(gpu_context);
        this.sprite_renderer = new SpriteRenderer(gpu_context);
    }

    async initialize(): Promise<boolean> {
        const device = this.gpu_context.get_device();
        const format = this.gpu_context.get_format();

        if (!device || !format) {
            return false;
        }

        const tile_shader = this.gpu_context.create_shader_module(`
            struct Uniforms {
                screen_width: f32,
                screen_height: f32,
            }

            @group(0) @binding(0) var<uniform> uniforms: Uniforms;

            struct VertexInput {
                @location(0) position: vec2<f32>,
                @location(1) color: vec4<f32>,
            }

            struct VertexOutput {
                @builtin(position) position: vec4<f32>,
                @location(0) color: vec4<f32>,
            }

            @vertex
            fn vertex_main(input: VertexInput) -> VertexOutput {
                var output: VertexOutput;
                let x = (input.position.x / uniforms.screen_width) * 2.0 - 1.0;
                let y = 1.0 - (input.position.y / uniforms.screen_height) * 2.0;
                output.position = vec4<f32>(x, y, 0.0, 1.0);
                output.color = input.color;
                return output;
            }

            @fragment
            fn fragment_main(input: VertexOutput) -> @location(0) vec4<f32> {
                return input.color;
            }
        `);

        if (!tile_shader) {
            return false;
        }

        this.bind_group_layout = this.gpu_context.create_bind_group_layout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: 'uniform' },
                },
            ],
        });

        if (!this.bind_group_layout) {
            return false;
        }

        this.uniform_buffer = this.gpu_context.create_buffer({
            size: 8,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        if (!this.uniform_buffer) {
            return false;
        }

        device.queue.writeBuffer(this.uniform_buffer, 0, new Float32Array([SCREEN_CONFIG.WIDTH, SCREEN_CONFIG.HEIGHT]));

        this.bind_group = this.gpu_context.create_bind_group({
            layout: this.bind_group_layout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this.uniform_buffer },
                },
            ],
        });

        const pipeline_layout = device.createPipelineLayout({
            bindGroupLayouts: [this.bind_group_layout],
        });

        this.tile_pipeline = device.createRenderPipeline({
            layout: pipeline_layout,
            vertex: {
                module: tile_shader,
                entryPoint: 'vertex_main',
                buffers: [
                    {
                        arrayStride: VERTEX_SIZE,
                        attributes: [
                            {
                                shaderLocation: 0,
                                offset: 0,
                                format: 'float32x2',
                            },
                            {
                                shaderLocation: 1,
                                offset: 8,
                                format: 'float32x4',
                            },
                        ],
                    },
                ],
            },
            fragment: {
                module: tile_shader,
                entryPoint: 'fragment_main',
                targets: [
                    {
                        format: format,
                        blend: {
                            color: {
                                srcFactor: 'src-alpha',
                                dstFactor: 'one-minus-src-alpha',
                                operation: 'add',
                            },
                            alpha: {
                                srcFactor: 'one',
                                dstFactor: 'one-minus-src-alpha',
                                operation: 'add',
                            },
                        },
                    },
                ],
            },
            primitive: {
                topology: 'triangle-list',
            },
        });

        const font_initialized = await this.font_renderer.initialize(
            './assets/images/fonts/SofiaSansExtraCondensed.fnt',
        );

        if (!font_initialized) {
            log_warning('Failed to initialize BitmapFont renderer, text will not be displayed');
        } else {
            log_message('BitmapFont renderer initialized successfully');
        }

        const sprite_initialized = await this.sprite_renderer.initialize(
            './assets/images/gameplay/1.plist',
            './assets/images/gameplay/1.png',
        );
        if (!sprite_initialized) {
            log_warning('Failed to initialize SpriteRenderer');
        } else {
            log_message('SpriteRenderer initialized successfully');
        }

        return true;
    }

    private create_rect_vertices(
        x: number,
        y: number,
        w: number,
        h: number,
        color: [number, number, number, number],
    ): RectangleVertex[] {
        const x2 = x + w;
        const y2 = y + h;
        return [
            { position: [x, y], color },
            { position: [x2, y], color },
            { position: [x2, y2], color },
            { position: [x, y], color },
            { position: [x2, y2], color },
            { position: [x, y2], color },
        ];
    }

    private create_tile_vertices(rect: TileData, scroll_offset: number): RectangleVertex[] {
        const effective_opacity = rect.flash_state ? rect.opacity * 0.5 : rect.opacity;
        const color = color_to_rgba(rect.color, effective_opacity);
        return this.create_rect_vertices(rect.x, rect.y + scroll_offset, rect.width, rect.height, color);
    }

    private create_grid_line_vertices(x: number): RectangleVertex[] {
        return this.create_rect_vertices(x, 0, SCREEN_CONFIG.GRID_LINE_WIDTH, SCREEN_CONFIG.HEIGHT, GRID_LINE_COLOR);
    }

    private create_particle_vertices(particle: ParticleData): RectangleVertex[] {
        const color = color_to_rgba(particle.color, particle.opacity);
        const half = particle.size * 0.5;
        return this.create_rect_vertices(particle.x - half, particle.y - half, particle.size, particle.size, color);
    }

    private create_note_indicator_vertices(indicator: NoteIndicatorData, scroll_offset: number): RectangleVertex[] {
        return this.create_rect_vertices(
            indicator.x,
            indicator.y + scroll_offset,
            indicator.width,
            indicator.height,
            NOTE_INDICATOR_COLOR,
        );
    }

    render(
        visible_rows: RowData[],
        particles: ParticleData[],
        game_over_indicator: TileData | null,
        scroll_offset: number,
        note_indicators: NoteIndicatorData[] = [],
        start_tile_pressed: boolean = false,
        score_data: ScoreData | null = null,
        score_renderer: ScoreRenderer | null = null,
        show_red_note_indicators: boolean = false,
    ): void {
        const device = this.gpu_context.get_device();
        const context = this.gpu_context.get_context();

        if (!device || !context || !this.tile_pipeline || !this.bind_group) {
            return;
        }

        const indicators_by_row = new Map<number, NoteIndicatorData[]>();
        for (let i = 0; i < note_indicators.length; i++) {
            const indicator = note_indicators[i];
            if (!indicator) continue;
            let list = indicators_by_row.get(indicator.row_index);
            if (!list) {
                list = [];
                indicators_by_row.set(indicator.row_index, list);
            }
            list.push(indicator);
        }

        const all_vertices: RectangleVertex[] = [];

        all_vertices.push(
            { position: [0, 0], color: WHITE_COLOR },
            { position: [SCREEN_CONFIG.WIDTH, 0], color: WHITE_COLOR },
            { position: [SCREEN_CONFIG.WIDTH, SCREEN_CONFIG.HEIGHT], color: WHITE_COLOR },
            { position: [0, 0], color: WHITE_COLOR },
            { position: [SCREEN_CONFIG.WIDTH, SCREEN_CONFIG.HEIGHT], color: WHITE_COLOR },
            { position: [0, SCREEN_CONFIG.HEIGHT], color: WHITE_COLOR },
        );

        const tiles_to_render: { rect: TileData; row: RowData }[] = [];
        let start_tile_data: { x: number; y: number; width: number; height: number } | null = null;

        for (let ri = 0; ri < visible_rows.length; ri++) {
            const row = visible_rows[ri];
            if (!row) continue;

            for (let ti = 0; ti < row.tiles.length; ti++) {
                const rect = row.tiles[ti];
                if (!rect) continue;

                tiles_to_render.push({ rect, row });

                if (row.row_type === RowType.StartingTileRow) {
                    start_tile_data = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                    if (rect.is_pressed) start_tile_pressed = true;
                }
            }
        }

        if (game_over_indicator) {
            const gy = game_over_indicator.y + scroll_offset;
            if (gy + game_over_indicator.height > 0 && gy < SCREEN_CONFIG.HEIGHT) {
                all_vertices.push(...this.create_tile_vertices(game_over_indicator, scroll_offset));
            }
        }

        const layer1_vertex_count = all_vertices.length;

        const screen_height = SCREEN_CONFIG.HEIGHT;
        for (let i = 0; i < particles.length; i++) {
            const particle = particles[i];
            if (!particle) continue;
            if (particle.y + particle.size * 0.5 > 0 && particle.y - particle.size * 0.5 < screen_height) {
                all_vertices.push(...this.create_particle_vertices(particle));
            }
        }

        for (let i = 0; i < GRID_LINE_POSITIONS.length; i++) {
            all_vertices.push(...this.create_grid_line_vertices(GRID_LINE_POSITIONS[i]!));
        }

        if (show_red_note_indicators) {
            const seen_keys = new Set<string>();
            for (let i = 0; i < note_indicators.length; i++) {
                const indicator = note_indicators[i];
                if (!indicator) continue;

                const key = `${indicator.row_index}_${indicator.time}`;
                if (seen_keys.has(key)) continue;
                seen_keys.add(key);

                const sy = indicator.y + scroll_offset;
                if (sy + indicator.height > 0 && sy < screen_height) {
                    all_vertices.push(...this.create_note_indicator_vertices(indicator, scroll_offset));
                }
            }
        }

        const vertex_count = all_vertices.length;
        const vertex_data = new Float32Array(vertex_count * VERTEX_STRIDE);

        for (let i = 0; i < vertex_count; i++) {
            const v = all_vertices[i];
            if (!v) continue;
            const o = i * VERTEX_STRIDE;
            vertex_data[o] = v.position[0];
            vertex_data[o + 1] = v.position[1];
            vertex_data[o + 2] = v.color[0];
            vertex_data[o + 3] = v.color[1];
            vertex_data[o + 4] = v.color[2];
            vertex_data[o + 5] = v.color[3];
        }

        const buffer_size = vertex_data.byteLength;
        if (!this.vertex_buffer || this.vertex_buffer.size < buffer_size) {
            this.vertex_buffer = this.gpu_context.create_buffer({
                size: buffer_size,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
        }
        if (this.vertex_buffer) {
            device.queue.writeBuffer(this.vertex_buffer, 0, vertex_data);
        }

        const texture = this.gpu_context.get_current_texture();
        const encoder = this.gpu_context.create_command_encoder();
        if (!texture || !encoder) return;

        const render_pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: texture.createView(),
                    clearValue: { r: 1, g: 1, b: 1, a: 1 },
                    loadOp: 'clear',
                    storeOp: 'store',
                },
            ],
        });

        render_pass.setPipeline(this.tile_pipeline);
        render_pass.setBindGroup(0, this.bind_group);
        render_pass.setVertexBuffer(0, this.vertex_buffer);
        if (layer1_vertex_count > 0) {
            render_pass.draw(layer1_vertex_count);
        }

        this.sprite_renderer.begin_frame();
        if (this.sprite_renderer.is_loaded()) {
            const now = performance.now();

            for (let i = 0; i < tiles_to_render.length; i++) {
                const item = tiles_to_render[i];
                if (!item) continue;

                const { rect, row } = item;
                const rect_y = rect.y + scroll_offset;
                if (rect_y + rect.height <= 0 || rect_y >= screen_height) continue;

                const is_long_tile =
                    row.height > SCREEN_CONFIG.BASE_ROW_HEIGHT && row.row_type !== RowType.StartingTileRow;
                const effective_opacity = rect.flash_state ? rect.opacity * 0.5 : rect.opacity;
                const row_bottom = rect_y + rect.height;
                const scale = rect.width / 134;

                if (is_long_tile) {
                    this.render_long_tile(
                        rect,
                        row,
                        rect_y,
                        row_bottom,
                        scale,
                        effective_opacity,
                        scroll_offset,
                        now,
                        render_pass,
                        indicators_by_row,
                    );
                } else {
                    this.render_short_tile(rect, row, rect_y, effective_opacity, now, render_pass);
                }
            }
        }

        render_pass.setPipeline(this.tile_pipeline);
        render_pass.setBindGroup(0, this.bind_group);
        render_pass.setVertexBuffer(0, this.vertex_buffer);
        const layer2_vertex_count = vertex_count - layer1_vertex_count;
        if (layer2_vertex_count > 0) {
            render_pass.draw(layer2_vertex_count, 1, layer1_vertex_count);
        }

        this.font_renderer.begin_frame();
        if (start_tile_data && this.font_renderer.is_loaded()) {
            const white_color: [number, number, number, number] = [1, 1, 1, start_tile_pressed ? 0 : 1];
            const scale = this.font_renderer.calculate_scale_to_fit('START', start_tile_data.width, 0.95);
            const text_width = this.font_renderer.get_text_width('START', scale);
            const tx = start_tile_data.x + (start_tile_data.width - text_width) * 0.5;
            const ty = start_tile_data.y + (start_tile_data.height - 128 * scale) * 0.5;
            this.font_renderer.render_text('START', tx, ty, scale, white_color, scroll_offset, render_pass);
        }

        if (score_data && score_renderer && score_renderer.is_ready()) {
            score_renderer.render(score_data, scroll_offset, render_pass);
        }

        render_pass.end();
        this.gpu_context.submit([encoder.finish()]);
    }

    private render_long_tile(
        rect: TileData,
        row: RowData,
        rect_y: number,
        row_bottom: number,
        scale: number,
        effective_opacity: number,
        scroll_offset: number,
        now: number,
        render_pass: GPURenderPassEncoder,
        indicators_by_row: Map<number, NoteIndicatorData[]>,
    ): void {
        const sprite_renderer = this.sprite_renderer;

        if (rect.is_pressed && !rect.is_released_early) {
            sprite_renderer.render_sprite('long_finish.png', rect.x, rect_y, rect.width, rect.height, render_pass, {
                opacity: effective_opacity,
                nine_slice: [20, 20, 20, 20],
            });
        } else {
            sprite_renderer.render_sprite('long_tap2.png', rect.x, rect_y, rect.width, rect.height, render_pass, {
                opacity: effective_opacity,
                nine_slice: [20, 20, 20, 20],
            });
        }

        if ((!rect.is_pressed && !rect.is_holding) || rect.is_released_early) {
            const head_h = 324 * scale;
            const head_y = row_bottom - head_h;
            const trim_y = head_y + 2 * scale;
            const scissor_y = Math.max(rect_y, trim_y - 1);
            sprite_renderer.render_sprite('long_head.png', rect.x, head_y, rect.width, head_h, render_pass, {
                opacity: effective_opacity,
                scissor: [rect.x, scissor_y, rect.width, rect.height],
            });
        }

        let fade_opacity = 1.0;
        let should_render_progress = rect.progress > 0 && rect.progress < rect.height;
        if (rect.is_pressed && !rect.is_released_early && rect.completed_at !== null) {
            const elapsed = now - rect.completed_at;
            if (elapsed < FADE_DURATION) {
                fade_opacity = 1.0 - elapsed / FADE_DURATION;
                should_render_progress = true;
            }
        }

        if (should_render_progress) {
            this.render_progress_effects(
                rect,
                rect_y,
                row_bottom,
                scale,
                effective_opacity,
                fade_opacity,
                now,
                render_pass,
            );
        }

        if (rect.is_holding) {
            this.render_holding_indicators(
                rect,
                row,
                rect_y,
                scale,
                effective_opacity,
                scroll_offset,
                render_pass,
                indicators_by_row,
            );
        }
    }

    private render_progress_effects(
        rect: TileData,
        rect_y: number,
        row_bottom: number,
        scale: number,
        effective_opacity: number,
        fade_opacity: number,
        now: number,
        render_pass: GPURenderPassEncoder,
    ): void {
        const prog_y = row_bottom - rect.progress;
        const final_opacity = effective_opacity * fade_opacity;
        const light_head_h = 218 * scale;
        const light_head_y = prog_y - 8;
        const light_body_y = light_head_y + light_head_h;
        const light_body_h = Math.max(0, row_bottom - light_body_y);

        this.sprite_renderer.render_sprite(
            'long_tilelight.png',
            rect.x,
            light_body_y,
            rect.width,
            light_body_h,
            render_pass,
            {
                opacity: final_opacity,
                nine_slice: [20, 20, 20, 20],
                scissor: [rect.x, rect_y, rect.width, rect.height],
            },
        );

        this.sprite_renderer.render_sprite(
            'long_light.png',
            rect.x,
            light_head_y,
            rect.width,
            light_head_h,
            render_pass,
            { opacity: final_opacity, scissor: [rect.x, rect_y, rect.width, rect.height] },
        );

        if (rect.last_note_played_at !== null) {
            this.render_dot_animation(rect, light_head_y, scale, final_opacity, now, render_pass);
            this.render_circle_animations(rect, light_head_y, scale, final_opacity, now, render_pass);
        }
    }

    private render_dot_animation(
        rect: TileData,
        light_head_y: number,
        scale: number,
        final_opacity: number,
        now: number,
        render_pass: GPURenderPassEncoder,
    ): void {
        const elapsed = now - (rect.last_note_played_at ?? 0);
        if (elapsed >= DOT_DURATION) return;

        let anim_scale: number;
        let anim_opacity: number;

        if (elapsed < PEAK_TIME) {
            const t = elapsed / PEAK_TIME;
            anim_scale = 1.0 + 0.3 * t;
            anim_opacity = 1.0;
        } else {
            const t = (elapsed - PEAK_TIME) / (DOT_DURATION - PEAK_TIME);
            anim_scale = 1.3 * (1.0 - t);
            anim_opacity = 1.0 - t;
        }

        const base_dot_size = 60 * scale;
        this.sprite_renderer.render_sprite(
            'dot_light.png',
            rect.x + rect.width * 0.5,
            light_head_y,
            base_dot_size * anim_scale,
            base_dot_size * anim_scale,
            render_pass,
            { opacity: anim_opacity * final_opacity, anchor_x: 0.5, anchor_y: 0.5 },
        );
    }

    private render_circle_animations(
        rect: TileData,
        light_head_y: number,
        scale: number,
        final_opacity: number,
        now: number,
        render_pass: GPURenderPassEncoder,
    ): void {
        rect.active_circle_animations = rect.active_circle_animations.filter(st => now - st < CIRCLE_DURATION);

        const base_circle_size = 106 * scale;
        for (let i = 0; i < rect.active_circle_animations.length; i++) {
            const start_time = rect.active_circle_animations[i];
            if (start_time === undefined) continue;

            const elapsed = now - start_time;
            const t = elapsed / CIRCLE_DURATION;
            const circle_scale = 0.3 + t;
            const circle_opacity = 1.0 - t;

            this.sprite_renderer.render_sprite(
                'circle_light.png',
                rect.x + rect.width * 0.5,
                light_head_y,
                base_circle_size * circle_scale,
                base_circle_size * circle_scale,
                render_pass,
                { opacity: circle_opacity * final_opacity, anchor_x: 0.5, anchor_y: 0.5 },
            );
        }
    }

    private render_holding_indicators(
        rect: TileData,
        row: RowData,
        _rect_y: number,
        scale: number,
        effective_opacity: number,
        scroll_offset: number,
        render_pass: GPURenderPassEncoder,
        indicators_by_row: Map<number, NoteIndicatorData[]>,
    ): void {
        const row_indicators = indicators_by_row.get(row.row_index);
        if (!row_indicators) return;

        const dot_size = 16 * scale;
        const dot_x = rect.x + (rect.width - dot_size) * 0.5;
        const seen_times = new Set<number>();

        for (let i = 0; i < row_indicators.length; i++) {
            const indicator = row_indicators[i];
            if (!indicator || seen_times.has(indicator.time)) continue;
            seen_times.add(indicator.time);

            const dot_sy = indicator.y + scroll_offset;
            if (dot_sy + dot_size > 0 && dot_sy < SCREEN_CONFIG.HEIGHT) {
                this.sprite_renderer.render_sprite('dot.png', dot_x, dot_sy, dot_size, dot_size, render_pass, {
                    opacity: effective_opacity,
                });
            }
        }
    }

    private render_short_tile(
        rect: TileData,
        row: RowData,
        rect_y: number,
        effective_opacity: number,
        now: number,
        render_pass: GPURenderPassEncoder,
    ): void {
        let frame_name = row.row_type === RowType.StartingTileRow ? 'tile_start.png' : 'tile_black.png';

        if (rect.is_pressed && rect.completed_at !== null) {
            const frame_index = ((now - rect.completed_at) / ANIM_FRAME_TIME) | 0;
            if (frame_index === 1) frame_name = '1.png';
            else if (frame_index === 2) frame_name = '2.png';
            else if (frame_index === 3) frame_name = '3.png';
            else if (frame_index >= 4) frame_name = '4.png';
        }

        this.sprite_renderer.render_sprite(frame_name, rect.x, rect_y, rect.width, rect.height, render_pass, {
            opacity: effective_opacity,
        });
    }

    get_font_renderer(): BitmapFontRenderer {
        return this.font_renderer;
    }

    resize(_width: number, _height: number): void {
        const device = this.gpu_context.get_device();
        if (device && this.uniform_buffer) {
            device.queue.writeBuffer(
                this.uniform_buffer,
                0,
                new Float32Array([SCREEN_CONFIG.WIDTH, SCREEN_CONFIG.HEIGHT]),
            );
        }
    }
}
