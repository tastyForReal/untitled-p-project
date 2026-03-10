import { log_error } from '../game/logger.js';
import { GPUContext } from './gpu_context.js';
import { SCREEN_CONFIG } from '../game/types.js';
import { parse_spritesheet, SpritesheetData, SpriteFrame } from './spritesheet_parser.js';

interface SpriteVertex {
    position: [number, number];
    tex_coord: [number, number];
    color: [number, number, number, number];
}

export interface RenderSpriteOptions {
    anchor_x?: number;
    anchor_y?: number;
    opacity?: number;
    color?: [number, number, number];
    nine_slice?: [number, number, number, number];
    scissor?: [number, number, number, number];
}

export class SpriteRenderer {
    private gpu_context: GPUContext;
    private sheet_data: SpritesheetData | null = null;
    private texture: GPUTexture | null = null;
    private sampler: GPUSampler | null = null;
    private pipeline: GPURenderPipeline | null = null;
    private uniform_buffer: GPUBuffer | null = null;
    private bind_group: GPUBindGroup | null = null;
    private initialized: boolean = false;

    private vertex_buffer_pool: GPUBuffer[] = [];
    private pool_index: number = 0;
    private static readonly MAX_POOL_SIZE = 16;

    constructor(gpu_context: GPUContext) {
        this.gpu_context = gpu_context;
    }

    async initialize(plist_url: string, image_url: string): Promise<boolean> {
        const device = this.gpu_context.get_device();
        if (!device) return false;

        try {
            const plist_response = await fetch(plist_url);
            if (!plist_response.ok) return false;
            const plist_content = await plist_response.text();
            this.sheet_data = parse_spritesheet(plist_content);

            const texture_response = await fetch(image_url);
            if (!texture_response.ok) return false;
            const texture_blob = await texture_response.blob();
            const texture_bitmap = await createImageBitmap(texture_blob);

            this.texture = device.createTexture({
                size: { width: texture_bitmap.width, height: texture_bitmap.height },
                format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
            });

            device.queue.copyExternalImageToTexture(
                { source: texture_bitmap },
                { texture: this.texture },
                { width: texture_bitmap.width, height: texture_bitmap.height },
            );

            this.sampler = device.createSampler({
                magFilter: 'linear',
                minFilter: 'linear',
                addressModeU: 'clamp-to-edge',
                addressModeV: 'clamp-to-edge',
            });

            if (!this.create_pipeline()) return false;

            this.initialized = true;
            return true;
        } catch (error) {
            log_error('Failed to initialize SpriteRenderer:', error);
            return false;
        }
    }

    private create_pipeline(): boolean {
        const device = this.gpu_context.get_device();
        const format = this.gpu_context.get_format();
        if (!device || !format || !this.texture || !this.sampler) return false;

        const shader = device.createShaderModule({
            code: `
                struct Uniforms {
                    screen_width: f32,
                    screen_height: f32,
                }
                @group(0) @binding(0) var<uniform> uniforms: Uniforms;
                @group(0) @binding(1) var t_diffuse: texture_2d<f32>;
                @group(0) @binding(2) var s_diffuse: sampler;

                struct VertexInput {
                    @location(0) position: vec2<f32>,
                    @location(1) tex_coord: vec2<f32>,
                    @location(2) color: vec4<f32>,
                }
                struct VertexOutput {
                    @builtin(position) position: vec4<f32>,
                    @location(0) tex_coord: vec2<f32>,
                    @location(1) color: vec4<f32>,
                }

                @vertex
                fn vertex_main(input: VertexInput) -> VertexOutput {
                    var output: VertexOutput;
                    let x = (input.position.x / uniforms.screen_width) * 2.0 - 1.0;
                    let y = 1.0 - (input.position.y / uniforms.screen_height) * 2.0;
                    output.position = vec4<f32>(x, y, 0.0, 1.0);
                    output.tex_coord = input.tex_coord;
                    output.color = input.color;
                    return output;
                }

                @fragment
                fn fragment_main(input: VertexOutput) -> @location(0) vec4<f32> {
                    let tex_color = textureSample(t_diffuse, s_diffuse, input.tex_coord);
                    return tex_color * input.color;
                }
            `,
        });

        const bind_layout = device.createBindGroupLayout({
            entries: [
                { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
                { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
                { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
            ],
        });

        this.uniform_buffer = device.createBuffer({
            size: 8,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(this.uniform_buffer, 0, new Float32Array([SCREEN_CONFIG.WIDTH, SCREEN_CONFIG.HEIGHT]));

        this.bind_group = device.createBindGroup({
            layout: bind_layout,
            entries: [
                { binding: 0, resource: { buffer: this.uniform_buffer } },
                { binding: 1, resource: this.texture.createView() },
                { binding: 2, resource: this.sampler },
            ],
        });

        const pipeline_layout = device.createPipelineLayout({ bindGroupLayouts: [bind_layout] });

        this.pipeline = device.createRenderPipeline({
            layout: pipeline_layout,
            vertex: {
                module: shader,
                entryPoint: 'vertex_main',
                buffers: [
                    {
                        arrayStride: 32,
                        attributes: [
                            { shaderLocation: 0, offset: 0, format: 'float32x2' },
                            { shaderLocation: 1, offset: 8, format: 'float32x2' },
                            { shaderLocation: 2, offset: 16, format: 'float32x4' },
                        ],
                    },
                ],
            },
            fragment: {
                module: shader,
                entryPoint: 'fragment_main',
                targets: [
                    {
                        format: format,
                        blend: {
                            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                        },
                    },
                ],
            },
            primitive: { topology: 'triangle-list' },
        });

        return true;
    }

    is_loaded(): boolean {
        return this.initialized;
    }

    begin_frame(): void {
        this.pool_index = 0;
    }

    private get_buffer(required_size: number): GPUBuffer | null {
        const device = this.gpu_context.get_device();
        if (!device) return null;
        const size = Math.max(required_size, 1024);
        if (this.pool_index < this.vertex_buffer_pool.length) {
            const buf = this.vertex_buffer_pool[this.pool_index];
            if (buf && buf.size >= size) {
                this.pool_index++;
                return buf;
            }
        }
        const new_buf = device.createBuffer({
            size: Math.max(size, 16384),
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        if (this.vertex_buffer_pool.length < SpriteRenderer.MAX_POOL_SIZE) {
            this.vertex_buffer_pool.push(new_buf);
        }
        this.pool_index++;
        return new_buf;
    }

    render_sprite(
        frame_name: string,
        x: number,
        y: number,
        width: number,
        height: number,
        render_pass: GPURenderPassEncoder,
        options: RenderSpriteOptions = {},
    ): void {
        if (!this.initialized || !this.sheet_data) return;

        const frame = this.sheet_data.frames[frame_name];
        if (!frame) return;

        const anchor_x = options.anchor_x ?? 0;
        const anchor_y = options.anchor_y ?? 0;
        const start_x = x - width * anchor_x;
        const start_y = y - height * anchor_y;

        const opacity = options.opacity ?? 1.0;
        const col = options.color ?? [1, 1, 1];
        const color = [col[0]!, col[1]!, col[2]!, opacity] as [number, number, number, number];

        const vertices: SpriteVertex[] = [];

        if (options.nine_slice) {
            this.build_nine_slice(
                vertices,
                frame,
                start_x,
                start_y,
                width,
                height,
                color,
                options.nine_slice,
                options.scissor,
            );
        } else {
            this.build_quad(vertices, frame, start_x, start_y, width, height, color, options.scissor);
        }

        if (vertices.length === 0) return;

        const device = this.gpu_context.get_device();
        if (!device) return;

        const v_data = new Float32Array(vertices.length * 8);
        for (let i = 0; i < vertices.length; i++) {
            const v = vertices[i]!;
            const offset = i * 8;
            v_data[offset] = v.position[0];
            v_data[offset + 1] = v.position[1];
            v_data[offset + 2] = v.tex_coord[0];
            v_data[offset + 3] = v.tex_coord[1];
            v_data[offset + 4] = v.color[0];
            v_data[offset + 5] = v.color[1];
            v_data[offset + 6] = v.color[2];
            v_data[offset + 7] = v.color[3];
        }

        const buf = this.get_buffer(v_data.byteLength);
        if (!buf) return;

        device.queue.writeBuffer(buf, 0, v_data);

        render_pass.setPipeline(this.pipeline!);
        render_pass.setBindGroup(0, this.bind_group!);
        render_pass.setVertexBuffer(0, buf);
        render_pass.draw(vertices.length);
    }

    private calculate_uv(frame: SpriteFrame, norm_x: number, norm_y: number): [number, number] {
        const tex_w = this.sheet_data!.meta.size?.x ?? 1024;
        const tex_h = this.sheet_data!.meta.size?.y ?? 1024;

        const padding = 0.5;
        const fw = Math.max(0, frame.frame.w - padding * 2);
        const fh = Math.max(0, frame.frame.h - padding * 2);
        const fx = frame.frame.x + padding;
        const fy = frame.frame.y + padding;

        let u, v;
        if (frame.rotated) {
            u = (fx + (1 - norm_y) * fw) / tex_w;
            v = (fy + norm_x * fh) / tex_h;
        } else {
            u = (fx + norm_x * fw) / tex_w;
            v = (fy + norm_y * fh) / tex_h;
        }
        return [u, v];
    }

    private push_clipped_quad(
        vertices: SpriteVertex[],
        dst_rect: [number, number, number, number],
        norm_rect: [number, number, number, number],
        frame: SpriteFrame,
        color: [number, number, number, number],
        scissor?: [number, number, number, number],
    ) {
        let [dx, dy, dw, dh] = dst_rect;
        let [nx, ny, nw, nh] = norm_rect;

        if (scissor) {
            const sx = Math.max(dx, scissor[0]);
            const sy = Math.max(dy, scissor[1]);
            const ex = Math.min(dx + dw, scissor[0] + scissor[2]);
            const ey = Math.min(dy + dh, scissor[1] + scissor[3]);
            if (sx >= ex || sy >= ey) return;

            const clip_nx = nx + ((sx - dx) / dw) * nw;
            const clip_ny = ny + ((sy - dy) / dh) * nh;
            const clip_nw = ((ex - sx) / dw) * nw;
            const clip_nh = ((ey - sy) / dh) * nh;

            dx = sx;
            dy = sy;
            dw = ex - sx;
            dh = ey - sy;
            nx = clip_nx;
            ny = clip_ny;
            nw = clip_nw;
            nh = clip_nh;
        }

        const uv_00 = this.calculate_uv(frame, nx, ny);
        const uv_10 = this.calculate_uv(frame, nx + nw, ny);
        const uv_01 = this.calculate_uv(frame, nx, ny + nh);
        const uv_11 = this.calculate_uv(frame, nx + nw, ny + nh);

        vertices.push(
            { position: [dx, dy], tex_coord: uv_00, color },
            { position: [dx + dw, dy], tex_coord: uv_10, color },
            { position: [dx + dw, dy + dh], tex_coord: uv_11, color },

            { position: [dx, dy], tex_coord: uv_00, color },
            { position: [dx + dw, dy + dh], tex_coord: uv_11, color },
            { position: [dx, dy + dh], tex_coord: uv_01, color },
        );
    }

    private build_quad(
        vertices: SpriteVertex[],
        frame: SpriteFrame,
        x: number,
        y: number,
        w: number,
        h: number,
        color: [number, number, number, number],
        scissor?: [number, number, number, number],
    ) {
        this.push_clipped_quad(vertices, [x, y, w, h], [0, 0, 1, 1], frame, color, scissor);
    }

    private build_nine_slice(
        vertices: SpriteVertex[],
        frame: SpriteFrame,
        x: number,
        y: number,
        w: number,
        h: number,
        color: [number, number, number, number],
        nine_slice: [number, number, number, number],
        scissor?: [number, number, number, number],
    ) {
        const [t, r, b, l] = nine_slice;

        const src_w = frame.source_size.x;
        const src_h = frame.source_size.y;

        const left_nw = l / src_w;
        const right_nw = r / src_w;
        const mid_nw = 1 - left_nw - right_nw;
        const top_nh = t / src_h;
        const bot_nh = b / src_h;
        const mid_nh = 1 - top_nh - bot_nh;

        const cols = [
            { dw: l, nw: left_nw },
            { dw: Math.max(0, w - l - r), nw: mid_nw },
            { dw: r, nw: right_nw },
        ];

        const rows = [
            { dh: t, nh: top_nh },
            { dh: Math.max(0, h - t - b), nh: mid_nh },
            { dh: b, nh: bot_nh },
        ];

        let curr_y = y;
        let curr_ny = 0;
        for (const row of rows) {
            let curr_x = x;
            let curr_nx = 0;
            for (const col of cols) {
                if (col.dw > 0 && row.dh > 0) {
                    this.push_clipped_quad(
                        vertices,
                        [curr_x, curr_y, col.dw, row.dh],
                        [curr_nx, curr_ny, col.nw, row.nh],
                        frame,
                        color,
                        scissor,
                    );
                }
                curr_x += col.dw;
                curr_nx += col.nw;
            }
            curr_y += row.dh;
            curr_ny += row.nh;
        }
    }
}
