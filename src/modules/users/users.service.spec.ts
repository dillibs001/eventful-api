import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';

// 1. Mock bcrypt so we don't actually perform expensive hashing
jest.mock('bcrypt');

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  // 2. Create a mock object for PrismaService
  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    it('should create a new user successfully', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const hashedPassword = 'hashedPassword';
      
      // Mock findUnique to return null (user doesn't exist)
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      
      // Mock bcrypt.hash
      (bcrypt.hash as jest.Mock).mockResolvedValue(hashedPassword);
      
      // Mock create to return the created user
      const createdUser = {
        id: '1',
        email,
        role: Role.EVENTEE,
        createdAt: new Date(),
      };
      mockPrismaService.user.create.mockResolvedValue(createdUser);

      const result = await service.createUser(email, password, Role.EVENTEE);

      expect(result).toEqual(createdUser);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email,
          password: hashedPassword,
          role: Role.EVENTEE,
        },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });
    });

    it('should throw ConflictException if email exists', async () => {
      const email = 'existing@example.com';
      
      // Mock findUnique to return an existing user
      mockPrismaService.user.findUnique.mockResolvedValue({ id: '1', email });

      await expect(service.createUser(email, 'password', Role.EVENTEE))
        .rejects
        .toThrow(ConflictException);
    });
  });

  describe('findUserByEmail', () => {
    it('should return a user by email', async () => {
      const email = 'test@example.com';
      const user = { id: '1', email, password: 'hash' };
      
      mockPrismaService.user.findUnique.mockResolvedValue(user);

      const result = await service.findUserByEmail(email);

      expect(result).toEqual(user);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email } });
    });
  });
});