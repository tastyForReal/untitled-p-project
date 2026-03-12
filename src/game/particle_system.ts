import { ParticleData } from './types.js';
import { Color } from '../graphics/color.js';

const GRAVITY = 200;
const TWO_PI = Math.PI * 2;

export function create_particle(x: number, y: number, color: Color = Color.Black): ParticleData {
    const angle = Math.random() * TWO_PI;
    const speed = 50 + Math.random() * 150;

    return {
        x,
        y,
        velocity_x: Math.cos(angle) * speed,
        velocity_y: Math.sin(angle) * speed,
        size: 2 + Math.random() * 6,
        opacity: 1.0,
        decay_rate: 0.5 + Math.random() * 1.5,
        color,
    };
}

export function create_debris_particles(
    rect_x: number,
    rect_y: number,
    rect_width: number,
    rect_height: number,
    count: number = 20,
): ParticleData[] {
    const particles: ParticleData[] = new Array(count);

    for (let i = 0; i < count; i++) {
        particles[i] = create_particle(rect_x + Math.random() * rect_width, rect_y + Math.random() * rect_height);
    }

    return particles;
}

export function update_particle(particle: ParticleData, delta_time: number): boolean {
    particle.x += particle.velocity_x * delta_time;
    particle.y += particle.velocity_y * delta_time;
    particle.velocity_y += GRAVITY * delta_time;
    particle.opacity -= particle.decay_rate * delta_time;

    return particle.opacity > 0;
}

export function update_particles(particles: ParticleData[], delta_time: number): ParticleData[] {
    let write_index = 0;

    for (let read_index = 0; read_index < particles.length; read_index++) {
        const particle = particles[read_index];
        if (particle && update_particle(particle, delta_time)) {
            particles[write_index++] = particle;
        }
    }

    particles.length = write_index;
    return particles;
}

export class ParticleSystem {
    private particles: ParticleData[] = [];

    add_debris(rect_x: number, rect_y: number, rect_width: number, rect_height: number, count: number = 20): void {
        const new_particles = create_debris_particles(rect_x, rect_y, rect_width, rect_height, count);
        this.particles.push(...new_particles);
    }

    update(delta_time: number): void {
        update_particles(this.particles, delta_time);
    }

    get_particles(): ParticleData[] {
        return this.particles;
    }

    clear(): void {
        this.particles.length = 0;
    }

    get_count(): number {
        return this.particles.length;
    }
}
