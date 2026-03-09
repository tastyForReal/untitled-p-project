import { GPUContext } from './gpu_context.js';
import { BMFontRenderer } from './bm_font_renderer.js';
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

function color_to_rgba(color: Color, opacity: number = 1.0): [number, number, number, number] {
    return [color.r / 255, color.g / 255, color.b / 255, opacity];
}

export class Renderer {
    private gpu_context: GPUContext;
    private font_renderer: BMFontRenderer;
    private tile_pipeline: GPURenderPipeline | null = null;
    private vertex_buffer: GPUBuffer | null = null;
    private uniform_buffer: GPUBuffer | null = null;
    private bind_group: GPUBindGroup | null = null;
    private bind_group_layout: GPUBindGroupLayout | null = null;
    private sprite_renderer: SpriteRenderer;

    constructor(gpu_context: GPUContext) {
        this.gpu_context = gpu_context;
        this.font_renderer = new BMFontRenderer(gpu_context);
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
                        arrayStride: 24,
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
            console.warn('Failed to initialize BMFont renderer, text will not be displayed');
        } else {
            console.log('BMFont renderer initialized successfully');
        }

        const sprite_initialized = await this.sprite_renderer.initialize(
            './assets/images/gameplay/1.plist',
            './assets/images/gameplay/1.png',
        );
        if (!sprite_initialized) {
            console.warn('Failed to initialize SpriteRenderer');
        } else {
            console.log('SpriteRenderer initialized successfully');
        }

        return true;
    }

    private create_tile_vertices(rect: TileData, scroll_offset: number): RectangleVertex[] {
        const effective_opacity = rect.flash_state ? rect.opacity * 0.5 : rect.opacity;
        const color = color_to_rgba(rect.color, effective_opacity);

        const y = rect.y + scroll_offset;

        const vertices: RectangleVertex[] = [
            { position: [rect.x, y], color },
            { position: [rect.x + rect.width, y], color },
            { position: [rect.x + rect.width, y + rect.height], color },

            { position: [rect.x, y], color },
            { position: [rect.x + rect.width, y + rect.height], color },
            { position: [rect.x, y + rect.height], color },
        ];

        return vertices;
    }

    private create_grid_line_vertices(x: number): RectangleVertex[] {
        const color: [number, number, number, number] = [0, 0, 0, 1];

        return [
            { position: [x, 0], color },
            { position: [x + SCREEN_CONFIG.GRID_LINE_WIDTH, 0], color },
            {
                position: [x + SCREEN_CONFIG.GRID_LINE_WIDTH, SCREEN_CONFIG.HEIGHT],
                color,
            },

            { position: [x, 0], color },
            {
                position: [x + SCREEN_CONFIG.GRID_LINE_WIDTH, SCREEN_CONFIG.HEIGHT],
                color,
            },
            { position: [x, SCREEN_CONFIG.HEIGHT], color },
        ];
    }

    private create_particle_vertices(particle: ParticleData): RectangleVertex[] {
        const color = color_to_rgba(particle.color, particle.opacity);

        const half_size = particle.size / 2;

        return [
            { position: [particle.x - half_size, particle.y - half_size], color },
            { position: [particle.x + half_size, particle.y - half_size], color },
            { position: [particle.x + half_size, particle.y + half_size], color },

            { position: [particle.x - half_size, particle.y - half_size], color },
            { position: [particle.x + half_size, particle.y + half_size], color },
            { position: [particle.x - half_size, particle.y + half_size], color },
        ];
    }

    private create_note_indicator_vertices(indicator: NoteIndicatorData, scroll_offset: number): RectangleVertex[] {
        const color: [number, number, number, number] = [1, 0, 0, 1];
        const y = indicator.y + scroll_offset;

        return [
            { position: [indicator.x, y], color },
            { position: [indicator.x + indicator.width, y], color },
            { position: [indicator.x + indicator.width, y + indicator.height], color },

            { position: [indicator.x, y], color },
            { position: [indicator.x + indicator.width, y + indicator.height], color },
            { position: [indicator.x, y + indicator.height], color },
        ];
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
        for (const indicator of note_indicators) {
            let list = indicators_by_row.get(indicator.row_index);
            if (!list) {
                list = [];
                indicators_by_row.set(indicator.row_index, list);
            }
            list.push(indicator);
        }

        const all_vertices: RectangleVertex[] = [];

        const bg_vertices: RectangleVertex[] = [
            { position: [0, 0], color: [1, 1, 1, 1] },
            { position: [SCREEN_CONFIG.WIDTH, 0], color: [1, 1, 1, 1] },
            { position: [SCREEN_CONFIG.WIDTH, SCREEN_CONFIG.HEIGHT], color: [1, 1, 1, 1] },
            { position: [0, 0], color: [1, 1, 1, 1] },
            { position: [SCREEN_CONFIG.WIDTH, SCREEN_CONFIG.HEIGHT], color: [1, 1, 1, 1] },
            { position: [0, SCREEN_CONFIG.HEIGHT], color: [1, 1, 1, 1] },
        ];
        all_vertices.push(...bg_vertices);

        const tiles_to_render: { rect: TileData; row: RowData }[] = [];
        let start_tile_data: { x: number; y: number; width: number; height: number } | null = null;

        for (const row of visible_rows) {
            for (const rect of row.tiles) {
                tiles_to_render.push({ rect, row });

                if (row.row_type === RowType.START) {
                    start_tile_data = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
                    if (rect.is_pressed) start_tile_pressed = true;
                }
            }
        }

        if (game_over_indicator) {
            const gy = game_over_indicator.y + scroll_offset;
            if (gy + game_over_indicator.height > 0 && gy < SCREEN_CONFIG.HEIGHT) {
                const vertices = this.create_tile_vertices(game_over_indicator, scroll_offset);
                all_vertices.push(...vertices);
            }
        }

        const layer1_vertex_count = all_vertices.length;

        for (const particle of particles) {
            if (particle.y + particle.size / 2 > 0 && particle.y - particle.size / 2 < SCREEN_CONFIG.HEIGHT) {
                all_vertices.push(...this.create_particle_vertices(particle));
            }
        }

        const column_width = SCREEN_CONFIG.WIDTH / SCREEN_CONFIG.COLUMN_COUNT;
        for (let i = 1; i < SCREEN_CONFIG.COLUMN_COUNT; i++) {
            all_vertices.push(...this.create_grid_line_vertices(i * column_width));
        }

        if (show_red_note_indicators) {
            const seen_indicator_hits = new Set<string>();
            for (const indicator of note_indicators) {
                const hit_key = `${indicator.row_index}_${indicator.time}`;
                if (seen_indicator_hits.has(hit_key)) continue;
                seen_indicator_hits.add(hit_key);

                const sy = indicator.y + scroll_offset;
                if (sy + indicator.height > 0 && sy < SCREEN_CONFIG.HEIGHT) {
                    all_vertices.push(...this.create_note_indicator_vertices(indicator, scroll_offset));
                }
            }
        }

        const vertex_data = new Float32Array(all_vertices.length * 6);
        for (let i = 0; i < all_vertices.length; i++) {
            const v = all_vertices[i];
            if (!v) continue;
            const o = i * 6;
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
            const ANIM_FPS = 1000 / 30;
            const FRAME_TIME = 1000 / ANIM_FPS;

            for (const { rect, row } of tiles_to_render) {
                const rect_y = rect.y + scroll_offset;
                if (rect_y + rect.height <= 0 || rect_y >= SCREEN_CONFIG.HEIGHT) continue;

                const is_long_tile = row.height > SCREEN_CONFIG.BASE_ROW_HEIGHT && row.row_type !== RowType.START;
                const effective_opacity = rect.flash_state ? rect.opacity * 0.5 : rect.opacity;
                const row_bottom = rect_y + rect.height;
                const scale = rect.width / 134;

                if (is_long_tile) {
                    if (rect.is_pressed && !rect.is_released_early) {
                        this.sprite_renderer.render_sprite(
                            'long_finish.png',
                            rect.x,
                            rect_y,
                            rect.width,
                            rect.height,
                            render_pass,
                            {
                                opacity: effective_opacity,
                                nine_slice: [20, 20, 20, 20],
                            },
                        );
                    } else {
                        this.sprite_renderer.render_sprite(
                            'long_tap2.png',
                            rect.x,
                            rect_y,
                            rect.width,
                            rect.height,
                            render_pass,
                            {
                                opacity: effective_opacity,
                                nine_slice: [20, 20, 20, 20],
                            },
                        );
                    }

                    if ((!rect.is_pressed && !rect.is_holding) || rect.is_released_early) {
                        const head_w = rect.width;
                        const head_h = 324 * scale;
                        const head_y = row_bottom - head_h;
                        const trim_y = head_y + 2 * scale;
                        const scissor_y = Math.max(rect_y, trim_y - 1);
                        this.sprite_renderer.render_sprite(
                            'long_head.png',
                            rect.x,
                            head_y,
                            head_w,
                            head_h,
                            render_pass,
                            {
                                opacity: effective_opacity,
                                scissor: [rect.x, scissor_y, rect.width, rect.height],
                            },
                        );
                    }

                    const FADE_DURATION = 300;
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
                            {
                                opacity: final_opacity,
                                scissor: [rect.x, rect_y, rect.width, rect.height],
                            },
                        );

                        if (rect.last_note_played_at !== null) {
                            const elapsed = now - rect.last_note_played_at;

                            const DOT_DURATION = 300;
                            const PEAK_TIME = 50;
                            if (elapsed < DOT_DURATION) {
                                let anim_scale = 1.0;
                                let anim_opacity = 1.0;

                                if (elapsed < PEAK_TIME) {
                                    const t = elapsed / PEAK_TIME;
                                    anim_scale = 1.0 + (1.3 - 1.0) * t;
                                    anim_opacity = 1.0;
                                } else {
                                    const t = (elapsed - PEAK_TIME) / (DOT_DURATION - PEAK_TIME);
                                    anim_scale = 1.3 * (1.0 - t);
                                    anim_opacity = 1.0 - t;
                                }

                                const base_dot_w = 60 * scale;
                                const base_dot_h = 60 * scale;
                                this.sprite_renderer.render_sprite(
                                    'dot_light.png',
                                    rect.x + rect.width / 2,
                                    light_head_y,
                                    base_dot_w * anim_scale,
                                    base_dot_h * anim_scale,
                                    render_pass,
                                    {
                                        opacity: anim_opacity * final_opacity,
                                        anchor_x: 0.5,
                                        anchor_y: 0.5,
                                    },
                                );
                            }

                            const CIRCLE_DURATION = 300;

                            rect.active_circle_animations = rect.active_circle_animations.filter(
                                start_time => now - start_time < CIRCLE_DURATION,
                            );

                            for (const start_time of rect.active_circle_animations) {
                                const elapsed_circle = now - start_time;
                                const t = elapsed_circle / CIRCLE_DURATION;
                                const circle_scale = 0.3 + (1.3 - 0.3) * t;
                                const circle_opacity = 1.0 - t;

                                const base_circle_w = 106 * scale;
                                const base_circle_h = 106 * scale;
                                this.sprite_renderer.render_sprite(
                                    'circle_light.png',
                                    rect.x + rect.width / 2,
                                    light_head_y,
                                    base_circle_w * circle_scale,
                                    base_circle_h * circle_scale,
                                    render_pass,
                                    {
                                        opacity: circle_opacity * final_opacity,
                                        anchor_x: 0.5,
                                        anchor_y: 0.5,
                                    },
                                );
                            }
                        }
                    }

                    if (rect.is_holding) {
                        const row_indicators = indicators_by_row.get(row.row_index);
                        if (row_indicators) {
                            const dot_size = 16 * scale;
                            const dot_x = rect.x + (rect.width - dot_size) / 2;
                            const seen_dots = new Set<number>();
                            for (const indicator of row_indicators) {
                                if (seen_dots.has(indicator.time)) continue;
                                seen_dots.add(indicator.time);

                                const dot_sy = indicator.y + scroll_offset;
                                if (dot_sy + dot_size > 0 && dot_sy < SCREEN_CONFIG.HEIGHT) {
                                    this.sprite_renderer.render_sprite(
                                        'dot.png',
                                        dot_x,
                                        dot_sy,
                                        dot_size,
                                        dot_size,
                                        render_pass,
                                        {
                                            opacity: effective_opacity,
                                        },
                                    );
                                }
                            }
                        }
                    }
                } else {
                    let frame_name = row.row_type === RowType.START ? 'tile_start.png' : 'tile_black.png';
                    if (rect.is_pressed && rect.completed_at !== null) {
                        const elapsed = now - rect.completed_at;
                        const frame_index = Math.floor(elapsed / FRAME_TIME);
                        if (frame_index === 1) frame_name = '1.png';
                        else if (frame_index === 2) frame_name = '2.png';
                        else if (frame_index === 3) frame_name = '3.png';
                        else if (frame_index >= 4) frame_name = '4.png';
                    }
                    this.sprite_renderer.render_sprite(
                        frame_name,
                        rect.x,
                        rect_y,
                        rect.width,
                        rect.height,
                        render_pass,
                        { opacity: effective_opacity },
                    );
                }
            }
        }

        render_pass.setPipeline(this.tile_pipeline);
        render_pass.setBindGroup(0, this.bind_group);
        render_pass.setVertexBuffer(0, this.vertex_buffer);
        const layer2_vertex_count = all_vertices.length - layer1_vertex_count;
        if (layer2_vertex_count > 0) {
            render_pass.draw(layer2_vertex_count, 1, layer1_vertex_count);
        }

        this.font_renderer.begin_frame();
        if (start_tile_data && this.font_renderer.is_loaded()) {
            const white_color: [number, number, number, number] = [1, 1, 1, start_tile_pressed ? 0 : 1];
            const scale = this.font_renderer.calculate_scale_to_fit('START', start_tile_data.width, 0.95);
            const text_width = this.font_renderer.get_text_width('START', scale);
            const tx = start_tile_data.x + (start_tile_data.width - text_width) / 2;
            const ty = start_tile_data.y + (start_tile_data.height - 128 * scale) / 2;
            this.font_renderer.render_text('START', tx, ty, scale, white_color, scroll_offset, render_pass);
        }

        if (score_data && score_renderer && score_renderer.is_ready()) {
            score_renderer.render(score_data, scroll_offset, render_pass);
        }

        render_pass.end();
        this.gpu_context.submit([encoder.finish()]);
    }

    get_font_renderer(): BMFontRenderer {
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
