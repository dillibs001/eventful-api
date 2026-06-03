import { Injectable, UnauthorizedException} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';


@Injectable()
export class AuthService {
    constructor(
        private usersService: UsersService,
        private jwtService: JwtService
    ){}

    async register(registerDto: RegisterDto) {
// Pass the DTO data to your existing UsersService method
    const user = await this.usersService.createUser(
      registerDto.email,
      registerDto.password,
      registerDto.role,
    );
    return this.generateToken(user);
  }
// --- LOGIN FLOW ---
  async login(loginDto: LoginDto) {
    // 1. Find the user
    const user = await this.usersService.findUserByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 2. Verify the password
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // 3. Generate the token
    return this.generateToken(user);
  }

  // --- HELPER METHOD ---
  // We put this in a separate function so we don't repeat ourselves!
  private async generateToken(user: any) {
    const payload = { sub: user.id, email: user.email, role: user.role };
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }
}