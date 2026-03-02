import { random_float } from "../utils/math_utils.js";
import { ParticleData, COLORS } from "./types.js";

export function create_particle(x: number, y: number, color: string = COLORS.BLACK): ParticleData {
    const angle = random_float(0, Math.PI * 2);
    const speed = random_float(50, 200);

    return {
        x,
        y,
        velocity_x: Math.cos(angle) * speed,
        velocity_y: Math.sin(angle) * speed,
        size: random_float(2, 8),
        opacity: 1.0,
        decay_rate: random_float(0.5, 2.0),
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
    const particles: ParticleData[] = [];

    for (let i = 0; i < count; i++) {
        const particle_x = rect_x + random_float(0, rect_width);
        const particle_y = rect_y + random_float(0, rect_height);

        particles.push(create_particle(particle_x, particle_y));
    }

    return particles;
}

export function update_particle(particle: ParticleData, delta_time: number): boolean {
    particle.x += particle.velocity_x * delta_time;
    particle.y += particle.velocity_y * delta_time;

    particle.velocity_y += 200 * delta_time;

    particle.opacity -= particle.decay_rate * delta_time;

    return particle.opacity > 0;
}

export function update_particles(particles: ParticleData[], delta_time: number): ParticleData[] {
    return particles.filter(p => update_particle(p, delta_time));
}

export function clear_particles(_particles: ParticleData[]): ParticleData[] {
    return [];
}

export class ParticleSystem {
    private particles: ParticleData[] = [];

    add_debris(rect_x: number, rect_y: number, rect_width: number, rect_height: number, count: number = 20): void {
        const new_particles = create_debris_particles(rect_x, rect_y, rect_width, rect_height, count);
        this.particles.push(...new_particles);
    }

    update(delta_time: number): void {
        this.particles = update_particles(this.particles, delta_time);
    }

    get_particles(): ParticleData[] {
        return this.particles;
    }

    clear(): void {
        this.particles = [];
    }

    get_count(): number {
        return this.particles.length;
    }
}
