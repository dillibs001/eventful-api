import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Role, User } from '@prisma/client';
jest.mock('bcrypt');


describe('AuthService', () => {
  (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  let authService: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;

  // 1. Define strictly typed mock dependencies
  const mockUsersService = {
    createUser: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
  };

  // 2. Define reusable dummy data for our tests
  const mockUser: User = {
    id: 'user-id-123',
    email: 'test@example.com',
    password: 'hashed_password_from_db',
    role: Role.EVENTEE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockToken = 'mock_jwt_token_string';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    // CRITICAL: Wipe the memory of all mocks between tests
    // so data from test 1 doesn't magically appear in test 2.
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(authService).toBeDefined();
    });
  });

  describe('register', () => {
    it('should successfully register a user and return a token', async () => {
      // Arrange
      const registerDto = {
        email: 'test@example.com',
        password: 'plain_password',
        role: Role.EVENTEE,
      };

      mockUsersService.createUser.mockResolvedValue(mockUser);
      mockJwtService.signAsync.mockResolvedValue(mockToken);

      // Act
      const result = await authService.register(registerDto);

      // Assert
      expect(usersService.createUser).toHaveBeenCalledWith(
        registerDto.email,
        registerDto.password,
        registerDto.role,
      );
      expect(jwtService.signAsync).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
      expect(result).toEqual({ access_token: mockToken });
    });
  });

  describe('login', () => {
    it('should successfully log in and return a token (Happy Path)', async () => {
      // Arrange
      const loginDto = { email: 'test@example.com', password: 'plain_password' };
      
      mockUsersService.findUserByEmail.mockResolvedValue(mockUser);
      // Spy on bcrypt and force it to return true (password matches!)
      mockJwtService.signAsync.mockResolvedValue(mockToken);

      // Act
      const result = await authService.login(loginDto);

      // Assert
      expect(usersService.findUserByEmail).toHaveBeenCalledWith(loginDto.email);
      expect(bcrypt.compare).toHaveBeenCalledWith(loginDto.password, mockUser.password);
      expect(result).toEqual({ access_token: mockToken });
    });

    it('should throw UnauthorizedException if user is not found (Sad Path 1)', async () => {
      // Arrange
      const loginDto = { email: 'wrong@example.com', password: 'plain_password' };
      
      // Simulate the database finding nothing
      mockUsersService.findUserByEmail.mockResolvedValue(null);

      // Act & Assert
      // We expect the entire function to throw an error, so we wrap it in expect().rejects
      await expect(authService.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid email or password'),
      );
      
      // Ensure we didn't accidentally try to check the password of a null user
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if password does not match (Sad Path 2)', async () => {
      // Arrange
      const loginDto = { email: 'test@example.com', password: 'wrong_password' };
      
      mockUsersService.findUserByEmail.mockResolvedValue(mockUser);
      // Spy on bcrypt and force it to return false (password mismatch!)
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);

      // Act & Assert
      await expect(authService.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid email or password'),
      );
      
      // Ensure we didn't accidentally generate a token for an invalid password
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });
  });
});