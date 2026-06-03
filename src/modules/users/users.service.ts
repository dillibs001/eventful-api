import { Injectable, ConflictException} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {Role} from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService){}

    async createUser(email: string, password: string, role?: Role) {
        // Check if user with the same email already exists
        const existingUser = await this.prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            throw new ConflictException('Email is already in use');
        }
        
        // Hash the password before storing it
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        return this.prisma.user.create({    
            data: {
                email,
                password: hashedPassword,
                role
            },
            select: {
                id: true,
                email: true,
                role: true,
                createdAt: true,
            }
        });
    }
    async findUserByEmail(email: string) {
        return this.prisma.user.findUnique({ where: { email } });
    }
}
