import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';

export type JwtPayload = { sub: string; email: string };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly auth: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET ?? 'mila-dev-secret-do-not-use-in-prod',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.auth.findById(payload.sub);
    if (!user) throw new UnauthorizedException('Account no longer exists.');
    return this.auth.toPublic(user);
  }
}
