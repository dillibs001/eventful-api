import { Test, TestingModule } from '@nestjs/testing';
import { EventsService, CreatorAnalytics } from './events.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { NotFoundException } from '@nestjs/common';

 interface AuthenticatedRequest extends Request {
  user: {
    sub: string;
    email: string;
    role: string;
  };
}

describe('EventsService', () => {
  let service: EventsService;
  let prisma: PrismaService;
  let mailService: MailService;
  let cacheManager: any;

  const mockPrisma = {
    event: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    ticket: {
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    transaction: {
      aggregate: jest.fn(),
    },
  };

  const mockMailService = {
    sendTicketConfirmation: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMailService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    prisma = module.get<PrismaService>(PrismaService);
    mailService = module.get<MailService>(MailService);
    cacheManager = module.get(CACHE_MANAGER);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createEvent', () => {
    it('should create an event successfully', async () => {
      const dto = { 
        title: 'Test', 
        description: 'Desc', 
        date: '2026-12-25', 
        capacity: 100, 
        price: 50, 
        location: 'Lagos' 
      };
      mockPrisma.event.create.mockResolvedValue({ id: '1', ...dto });

      const result = await service.createEvent('creator-1', dto);

      expect(mockPrisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Test',
          date: new Date('2026-12-25'),
        }),
      });
      expect(result.id).toBe('1');
    });
  });

  describe('registerForEvent', () => {
    it('should register successfully and trigger email', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({ id: 'e1', title: 'Test Event' });
      mockPrisma.ticket.create.mockResolvedValue({ id: 't1' });

      await service.registerForEvent('e1', 'u1', 'user@test.com');

      expect(mockMailService.sendTicketConfirmation).toHaveBeenCalledWith(
        'user@test.com', 'Test Event', 't1'
      );
    });

    it('should throw NotFoundException if event does not exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);
      await expect(service.registerForEvent('e1', 'u1', 'test@test.com')).rejects.toThrow(NotFoundException);
    });
  });

describe('getCreatorDashboard', () => {
    it('should return cached data if cache exists', async () => {
      const creatorId = 'c1';
      const cachedData = { 
        totalTicketsSold: 10, 
        totalAttendees: 5, 
        totalRevenue: 500 
      };

      // Directly override the function on the injected instance
      cacheManager.get = jest.fn().mockResolvedValue(cachedData);

      const result = await service.getCreatorDashboard(creatorId);

      expect(result.source).toBe('cache');
      expect(result.data).toEqual(cachedData);
      expect(prisma.ticket.aggregate).not.toHaveBeenCalled(); 
    });

    it('should fetch from DB and save to cache on cache miss', async () => {
      // Directly override to force a cache miss
      cacheManager.get = jest.fn().mockResolvedValue(null);
      cacheManager.set = jest.fn().mockResolvedValue('OK'); // Mock the set method 
      
      mockPrisma.ticket.aggregate.mockResolvedValue({ _count: { id: 5, isScanned: 2 } });
      mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 1000 } });

      const result = await service.getCreatorDashboard('c1');

      expect(result.source).toBe('database');
      expect(cacheManager.set).toHaveBeenCalled(); 
      expect(result.data.totalTicketsSold).toBe(5);
    });
  });
});