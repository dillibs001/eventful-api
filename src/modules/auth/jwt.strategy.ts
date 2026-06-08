import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';


export type JwtPayload = {
  sub: string;
  email: string;
  role: Role;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
   // look in the "Authorization: Bearer <token>" header
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
// Reject tokens that have expired
      ignoreExpiration: false,
      //  Must perfectly match the key in your AuthModule!
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'), 
    });
  }

// If the token is valid, this function runs automatically
  async validate(payload: JwtPayload) {
    // What we return here gets attached to `req.user` in our controllers!
    return { userId: payload.sub, email: payload.email, role: payload.role };
  }
}