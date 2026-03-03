import { GPUContext } from "./gpu_context.js";
import { hex_to_rgba } from "../utils/math_utils.js";
import { RowData, TileData, ParticleData, SCREEN_CONFIG } from "../game/types.js";
import { NoteIndicatorData } from "../game/note_indicator.js";

interface RectangleVertex {
    position: [number, number];
    color: [number, number, number, number];
}

/**
 * Manages the WebGPU rendering pipelines and buffers.
 * Translates the pure logical game state into triangle-list vertices,
 * utilizing a flat-colored shader pipeline for rendering paths and particles.
 */
export class Renderer {
    private gpu_context: GPUContext;
    private rectangle_pipeline: GPURenderPipeline | null = null;
    private vertex_buffer: GPUBuffer | null = null;
    private uniform_buffer: GPUBuffer | null = null;
    private bind_group: GPUBindGroup | null = null;
    private bind_group_layout: GPUBindGroupLayout | null = null;

    constructor(gpu_context: GPUContext) {
        this.gpu_context = gpu_context;
    }

    async initialize(): Promise<boolean> {
        const device = this.gpu_context.get_device();
        const format = this.gpu_context.get_format();

        if (!device || !format) {
            return false;
        }

        const rectangle_shader = this.gpu_context.create_shader_module(`
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
                
                // Transform canvas pixel space (top-left origin) to WebGPU Normalized Device Coordinates (NDC)
                // NDC: [-1, -1] bottom-left, [1, 1] top-right
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

        if (!rectangle_shader) {
            return false;
        }

        this.bind_group_layout = this.gpu_context.create_bind_group_layout({
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.VERTEX,
                    buffer: { type: "uniform" },
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

        this.rectangle_pipeline = device.createRenderPipeline({
            layout: pipeline_layout,
            vertex: {
                module: rectangle_shader,
                entryPoint: "vertex_main",
                buffers: [
                    {
                        arrayStride: 24,
                        attributes: [
                            {
                                shaderLocation: 0,
                                offset: 0,
                                format: "float32x2",
                            },
                            {
                                shaderLocation: 1,
                                offset: 8,
                                format: "float32x4",
                            },
                        ],
                    },
                ],
            },
            fragment: {
                module: rectangle_shader,
                entryPoint: "fragment_main",
                targets: [
                    {
                        format: format,
                        blend: {
                            color: {
                                srcFactor: "src-alpha",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                            alpha: {
                                srcFactor: "one",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                        },
                    },
                ],
            },
            primitive: {
                topology: "triangle-list",
            },
        });

        return true;
    }

    private create_rectangle_vertices(rect: TileData, scroll_offset: number): RectangleVertex[] {
        const [r, g, b, _] = hex_to_rgba(rect.color);

        const effective_opacity = rect.flash_state ? rect.opacity * 0.5 : rect.opacity;

        const color: [number, number, number, number] = [r, g, b, effective_opacity];

        const y = rect.y + scroll_offset;

        const vertices: RectangleVertex[] = [
            { position: [rect.x, y], color },
            { position: [rect.x + rect.width, y], color },
            { position: [rect.x + rect.width, y + rect.height], color },

            { position: [rect.x, y], color },
            { position: [rect.x + rect.width, y + rect.height], color },
            { position: [rect.x, y + rect.height], color },
        ];

        if (rect.progress > 0 && rect.progress < rect.height) {
            const progress_color: [number, number, number, number] = [1, 1, 0, 1]; // YELLOW

            const row_bottom = y + rect.height;
            const prog_y = row_bottom - rect.progress;

            const radius = rect.width / 2;
            const center_x = rect.x + radius;
            const center_y = prog_y + radius;

            const body_top = Math.min(center_y, row_bottom);

            if (body_top < row_bottom) {
                vertices.push(
                    { position: [rect.x, body_top], color: progress_color },
                    { position: [rect.x + rect.width, body_top], color: progress_color },
                    { position: [rect.x + rect.width, row_bottom], color: progress_color },
                    { position: [rect.x, body_top], color: progress_color },
                    { position: [rect.x + rect.width, row_bottom], color: progress_color },
                    { position: [rect.x, row_bottom], color: progress_color },
                );
            }

            const segments = 16;
            for (let i = 0; i < segments; i++) {
                const theta1 = (i / segments) * Math.PI;
                const theta2 = ((i + 1) / segments) * Math.PI;

                const orig_p1_x = center_x + radius * Math.cos(theta1);
                const orig_p1_y = center_y - radius * Math.sin(theta1);

                const orig_p2_x = center_x + radius * Math.cos(theta2);
                const orig_p2_y = center_y - radius * Math.sin(theta2);

                const clip_point = (px: number, py: number): [number, number] => {
                    if (py > row_bottom) {
                        if (Math.abs(py - center_y) < 0.001) {
                            return [px, row_bottom];
                        }
                        const t = (row_bottom - center_y) / (py - center_y);
                        if (t < 0 || t > 1) {
                            return [px, row_bottom];
                        }
                        return [center_x + t * (px - center_x), row_bottom];
                    }
                    return [px, py];
                };

                const [p1_x, p1_y] = clip_point(orig_p1_x, orig_p1_y);
                const [p2_x, p2_y] = clip_point(orig_p2_x, orig_p2_y);

                let cy = center_y;
                if (cy > row_bottom) cy = row_bottom;

                vertices.push(
                    { position: [center_x, cy], color: progress_color },
                    { position: [p1_x, p1_y], color: progress_color },
                    { position: [p2_x, p2_y], color: progress_color },
                );
            }
        }

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
        const [r, g, b, _] = hex_to_rgba(particle.color);
        const color: [number, number, number, number] = [r, g, b, particle.opacity];

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
        const color: [number, number, number, number] = [1, 0, 0, 1]; // RED
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

    /**
     * Rebuilds the combined vertex buffer dynamically per-frame, then submits the draw call.
     * Uses a single unified render pass with one pipeline and buffer strategy, optimizing for
     * the relatively low polygon count of flat 2D shapes rather than relying on instancing.
     */
    render(
        visible_rows: RowData[],
        particles: ParticleData[],
        game_over_indicator: TileData | null,
        scroll_offset: number,
        note_indicators: NoteIndicatorData[] = [],
    ): void {
        const device = this.gpu_context.get_device();
        const context = this.gpu_context.get_context();

        if (!device || !context || !this.rectangle_pipeline || !this.bind_group) {
            return;
        }

        const all_vertices: RectangleVertex[] = [];

        const bg_vertices: RectangleVertex[] = [
            { position: [0, 0], color: [1, 1, 1, 1] },
            { position: [SCREEN_CONFIG.WIDTH, 0], color: [1, 1, 1, 1] },
            {
                position: [SCREEN_CONFIG.WIDTH, SCREEN_CONFIG.HEIGHT],
                color: [1, 1, 1, 1],
            },
            { position: [0, 0], color: [1, 1, 1, 1] },
            {
                position: [SCREEN_CONFIG.WIDTH, SCREEN_CONFIG.HEIGHT],
                color: [1, 1, 1, 1],
            },
            { position: [0, SCREEN_CONFIG.HEIGHT], color: [1, 1, 1, 1] },
        ];
        all_vertices.push(...bg_vertices);

        for (const row of visible_rows) {
            for (const rect of row.rectangles) {
                const vertices = this.create_rectangle_vertices(rect, scroll_offset);
                all_vertices.push(...vertices);
            }
        }

        if (game_over_indicator) {
            const vertices = this.create_rectangle_vertices(game_over_indicator, scroll_offset);
            all_vertices.push(...vertices);
        }

        for (const particle of particles) {
            const vertices = this.create_particle_vertices(particle);
            all_vertices.push(...vertices);
        }

        const column_width = SCREEN_CONFIG.WIDTH / SCREEN_CONFIG.COLUMN_COUNT;
        for (let i = 1; i < SCREEN_CONFIG.COLUMN_COUNT; i++) {
            const line_x = i * column_width;
            const vertices = this.create_grid_line_vertices(line_x);
            all_vertices.push(...vertices);
        }

        // Draw note indicators (red squares) at the very front
        for (const indicator of note_indicators) {
            const indicator_screen_y = indicator.y + scroll_offset;
            // Only draw visible indicators
            if (indicator_screen_y + indicator.height > 0 && indicator_screen_y < SCREEN_CONFIG.HEIGHT) {
                const vertices = this.create_note_indicator_vertices(indicator, scroll_offset);
                all_vertices.push(...vertices);
            }
        }

        const vertex_data = new Float32Array(all_vertices.length * 6);
        for (let i = 0; i < all_vertices.length; i++) {
            const vertex = all_vertices[i];
            if (!vertex) continue;
            const offset = i * 6;
            vertex_data[offset] = vertex.position[0] ?? 0;
            vertex_data[offset + 1] = vertex.position[1] ?? 0;
            vertex_data[offset + 2] = vertex.color[0] ?? 0;
            vertex_data[offset + 3] = vertex.color[1] ?? 0;
            vertex_data[offset + 4] = vertex.color[2] ?? 0;
            vertex_data[offset + 5] = vertex.color[3] ?? 0;
        }

        const buffer_size = vertex_data.byteLength;
        if (!this.vertex_buffer || this.vertex_buffer.size < buffer_size) {
            this.vertex_buffer = this.gpu_context.create_buffer({
                size: buffer_size,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            });
        }

        if (!this.vertex_buffer) {
            return;
        }

        device.queue.writeBuffer(this.vertex_buffer, 0, vertex_data);

        const texture = this.gpu_context.get_current_texture();
        if (!texture) {
            return;
        }

        const encoder = this.gpu_context.create_command_encoder();
        if (!encoder) {
            return;
        }

        const render_pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: texture.createView(),
                    clearValue: { r: 1, g: 1, b: 1, a: 1 },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });

        render_pass.setPipeline(this.rectangle_pipeline);
        render_pass.setBindGroup(0, this.bind_group);

        render_pass.setVertexBuffer(0, this.vertex_buffer);

        render_pass.draw(all_vertices.length);

        render_pass.end();

        this.gpu_context.submit([encoder.finish()]);
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
