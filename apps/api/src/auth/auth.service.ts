import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import type { LoginDto, RegisterDto } from './dto';

export type PublicUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

export type AuthSuccess = {
  user: PublicUser;
  token: string;
  expiresAt: string;
};

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthSuccess> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('An account with that email already exists.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name?.trim() || null,
        passwordHash,
      },
    });
    return this.sign(user);
  }

  async login(dto: LoginDto): Promise<AuthSuccess> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) throw new UnauthorizedException('Invalid email or password.');

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password.');

    return this.sign(user);
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  toPublic(user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    createdAt: Date;
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
    };
  }

  private async sign(user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    createdAt: Date;
  }): Promise<AuthSuccess> {
    const ttlSec = Number(process.env.JWT_TTL_SECONDS ?? 60 * 60 * 24 * 14); // 14 days default
    const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
    const token = await this.jwt.signAsync(
      { sub: user.id, email: user.email },
      { expiresIn: ttlSec },
    );
    return { user: this.toPublic(user), token, expiresAt };
  }
}
