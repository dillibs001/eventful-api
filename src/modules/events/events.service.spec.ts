import { Test, TestingModule } from '@nestjs/testing';
import { EventsService, CreatorAnalytics } from './events.service';
import { PrismaService } from '../../prisma/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

describe('EventsService', () => {
  let service: EventsService;
  let prisma: PrismaService;
  let cacheManager: any;
  let emailQueue: any;

  const mockPrisma = {
    event: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    ticket: {
      create: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    transaction: {
      aggregate: jest.fn(),
      findMany: jest.fn(),
    },
    reminder: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockEmailQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: getQueueToken('email-queue'), useValue: mockEmailQueue },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    prisma = module.get<PrismaService>(PrismaService);
    cacheManager = module.get(CACHE_MANAGER);
    emailQueue = module.get(getQueueToken('email-queue'));

    mockCacheManager.get.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createEvent', () => {
    it('should create an event successfully and invalidate the events list cache', async () => {
      const dto = {
        title: 'Test',
        description: 'Desc',
        date: '2026-12-25',
        capacity: 100,
        price: 50,
        location: 'Lagos',
      };
      mockPrisma.event.create.mockResolvedValue({ id: '1', ...dto });

      const result = await service.createEvent('creator-1', dto);

      expect(mockPrisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: 'Test',
          date: new Date('2026-12-25'),
          reminderOffsets: [],
        }),
      });
      expect(mockCacheManager.del).toHaveBeenCalledWith('events:all');
      expect(result.id).toBe('1');
    });

    it('should pass through creator-configured reminderOffsets', async () => {
      const dto = {
        title: 'Test',
        description: 'Desc',
        date: '2026-12-25',
        capacity: 100,
        location: 'Lagos',
        reminderOffsets: [60, 1440],
      };
      mockPrisma.event.create.mockResolvedValue({ id: '1', ...dto });

      await service.createEvent('creator-1', dto);

      expect(mockPrisma.event.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ reminderOffsets: [60, 1440] }),
      });
    });
  });

  describe('findByCreator', () => {
    it('should return events created by the given creator with ticket counts', async () => {
      const events = [{ id: 'e1', creatorId: 'c1', _count: { tickets: 3 } }];
      mockPrisma.event.findMany.mockResolvedValue(events);

      const result = await service.findByCreator('c1');

      expect(mockPrisma.event.findMany).toHaveBeenCalledWith({
        where: { creatorId: 'c1' },
        include: { _count: { select: { tickets: true } } },
        orderBy: { date: 'asc' },
      });
      expect(result).toEqual(events);
    });
  });

  describe('getEventAttendees', () => {
    it('should return attendees for the event when called by its creator', async () => {
      const event = { id: 'e1', creatorId: 'c1' };
      const tickets = [{ id: 't1', user: { id: 'u1', email: 'a@test.com' } }];
      mockPrisma.event.findUnique.mockResolvedValue(event);
      mockPrisma.ticket.findMany.mockResolvedValue(tickets);

      const result = await service.getEventAttendees('e1', 'c1');

      expect(result).toEqual(tickets);
    });

    it('should throw ForbiddenException if a non-creator requests attendees', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({ id: 'e1', creatorId: 'c1' });

      await expect(service.getEventAttendees('e1', 'someone-else')).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if the event does not exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);

      await expect(service.getEventAttendees('e1', 'c1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getShareLinks', () => {
    it('should return share links for the event', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        id: 'e1',
        title: 'Cool Event',
        description: 'A really cool event',
      });

      const result = await service.getShareLinks('e1');

      expect(result.url).toContain('/events/e1');
      expect(result.platforms.twitter).toContain('twitter.com');
      expect(result.platforms.facebook).toContain('facebook.com');
      expect(result.platforms.whatsapp).toContain('wa.me');
      expect(result.platforms.linkedin).toContain('linkedin.com');
    });
  });

  describe('setReminder', () => {
    it('should create a reminder for the eventee', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        id: 'e1',
        title: 'Event',
        date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
      });
      mockPrisma.reminder.create.mockResolvedValue({ id: 'r1', userId: 'u1', eventId: 'e1', offsetMinutes: 60 });
      mockPrisma.ticket.findUnique.mockResolvedValue(null);

      const result = await service.setReminder('u1', 'e1', { offsetMinutes: 60 });

      expect(result).toEqual({ id: 'r1', userId: 'u1', eventId: 'e1', offsetMinutes: 60 });
      expect(emailQueue.add).not.toHaveBeenCalled();
    });

    it('should schedule the reminder immediately if the user already has a ticket', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({
        id: 'e1',
        title: 'Event',
        date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
      });
      mockPrisma.reminder.create.mockResolvedValue({ id: 'r1', userId: 'u1', eventId: 'e1', offsetMinutes: 60 });
      mockPrisma.ticket.findUnique.mockResolvedValue({ id: 't1', userId: 'u1', eventId: 'e1' });
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'user@test.com' });

      await service.setReminder('u1', 'e1', { offsetMinutes: 60 });

      expect(emailQueue.add).toHaveBeenCalledWith(
        'event-reminder',
        { email: 'user@test.com', eventTitle: 'Event' },
        expect.objectContaining({ delay: expect.any(Number) }),
      );
    });

    it('should throw NotFoundException if the event does not exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);

      await expect(service.setReminder('u1', 'e1', { offsetMinutes: 60 })).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if the same reminder already exists', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({ id: 'e1', title: 'Event', date: new Date() });
      mockPrisma.reminder.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '6.0.0' }),
      );

      await expect(service.setReminder('u1', 'e1', { offsetMinutes: 60 })).rejects.toThrow(ConflictException);
    });
  });

  describe('getCreatorDashboard', () => {
    it('should return cached data if cache exists', async () => {
      const creatorId = 'c1';
      const cachedData = {
        totalTicketsSold: 10,
        totalAttendees: 5,
        totalRevenue: 500,
      };

      cacheManager.get = jest.fn().mockResolvedValue(cachedData);

      const result = await service.getCreatorDashboard(creatorId);

      expect(result.source).toBe('cache');
      expect(result.data).toEqual(cachedData);
      expect(prisma.ticket.aggregate).not.toHaveBeenCalled();
    });

    it('should fetch from DB and save to cache on cache miss', async () => {
      cacheManager.get = jest.fn().mockResolvedValue(null);
      cacheManager.set = jest.fn().mockResolvedValue('OK');

      mockPrisma.ticket.aggregate.mockResolvedValue({ _count: { id: 5, isScanned: 2 } });
      mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 1000 } });

      const result = await service.getCreatorDashboard('c1');

      expect(result.source).toBe('database');
      expect(cacheManager.set).toHaveBeenCalled();
      expect(result.data.totalTicketsSold).toBe(5);
    });
  });

  describe('getEventAnalytics', () => {
    it('should throw ForbiddenException if a non-creator requests analytics', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({ id: 'e1', creatorId: 'c1' });

      await expect(service.getEventAnalytics('e1', 'someone-else')).rejects.toThrow(ForbiddenException);
    });

    it('should compute per-event analytics on cache miss', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({ id: 'e1', creatorId: 'c1' });
      mockCacheManager.get.mockResolvedValue(null);
      mockPrisma.ticket.aggregate.mockResolvedValue({ _count: { id: 3, isScanned: 1 } });
      mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: 300 } });

      const result = await service.getEventAnalytics('e1', 'c1');

      expect(result.source).toBe('database');
      expect(result.data).toEqual<CreatorAnalytics>({
        totalTicketsSold: 3,
        totalAttendees: 1,
        totalRevenue: 300,
      });
      expect(mockCacheManager.set).toHaveBeenCalled();
    });
  });

  describe('getEventTransactions', () => {
    it('should return transactions for the event when called by its creator', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({ id: 'e1', creatorId: 'c1' });
      const transactions = [{ id: 'tx1', amount: 5000, status: 'SUCCESS' }];
      mockPrisma.transaction.findMany.mockResolvedValue(transactions);

      const result = await service.getEventTransactions('e1', 'c1');

      expect(result).toEqual(transactions);
    });

    it('should throw ForbiddenException if a non-creator requests transactions', async () => {
      mockPrisma.event.findUnique.mockResolvedValue({ id: 'e1', creatorId: 'c1' });

      await expect(service.getEventTransactions('e1', 'someone-else')).rejects.toThrow(ForbiddenException);
    });
  });
});
