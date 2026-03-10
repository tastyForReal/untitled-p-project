import { log_error } from '../game/logger.js';

export class GPUContext {
    private device: GPUDevice | null = null;
    private context: GPUCanvasContext | null = null;
    private format: GPUTextureFormat | null = null;
    private canvas: HTMLCanvasElement | null = null;

    async initialize(canvas: HTMLCanvasElement): Promise<boolean> {
        if (!navigator.gpu) {
            log_error('WebGPU not supported');
            return false;
        }

        try {
            const adapter = await navigator.gpu.requestAdapter();
            if (!adapter) {
                log_error('Failed to get GPU adapter');
                return false;
            }

            this.device = await adapter.requestDevice();
            this.canvas = canvas;
            this.context = canvas.getContext('webgpu');

            if (!this.context) {
                log_error('Failed to get WebGPU context');
                return false;
            }

            this.format = navigator.gpu.getPreferredCanvasFormat();
            this.context.configure({
                device: this.device,
                format: this.format,
                alphaMode: 'premultiplied',
            });

            return true;
        } catch (error) {
            log_error('WebGPU initialization error:', error);
            return false;
        }
    }

    get_device(): GPUDevice | null {
        return this.device;
    }

    get_context(): GPUCanvasContext | null {
        return this.context;
    }

    get_format(): GPUTextureFormat | null {
        return this.format;
    }

    get_canvas(): HTMLCanvasElement | null {
        return this.canvas;
    }

    create_texture(width: number, height: number): GPUTexture | null {
        if (!this.device) {
            return null;
        }

        return this.device.createTexture({
            size: { width, height },
            format: this.format || 'bgra8unorm',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
    }

    create_command_encoder(): GPUCommandEncoder | null {
        if (!this.device) {
            return null;
        }
        return this.device.createCommandEncoder();
    }

    create_render_pipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline | null {
        if (!this.device) {
            return null;
        }
        return this.device.createRenderPipeline(descriptor);
    }

    create_shader_module(code: string): GPUShaderModule | null {
        if (!this.device) {
            return null;
        }
        return this.device.createShaderModule({ code });
    }

    create_buffer(descriptor: GPUBufferDescriptor): GPUBuffer | null {
        if (!this.device) {
            return null;
        }
        return this.device.createBuffer(descriptor);
    }

    create_bind_group_layout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout | null {
        if (!this.device) {
            return null;
        }
        return this.device.createBindGroupLayout(descriptor);
    }

    create_bind_group(descriptor: GPUBindGroupDescriptor): GPUBindGroup | null {
        if (!this.device) {
            return null;
        }
        return this.device.createBindGroup(descriptor);
    }

    submit(command_buffers: GPUCommandBuffer[]): void {
        if (this.device) {
            this.device.queue.submit(command_buffers);
        }
    }

    get_current_texture(): GPUTexture | null {
        if (this.context) {
            return this.context.getCurrentTexture();
        }
        return null;
    }
}
