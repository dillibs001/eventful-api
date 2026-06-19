import { Test, TestingModule } from '@nestjs/testing';
import { TicketsService } from './tickets.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import { MailService } from '../mail/mail.service';
import { getQueueToken } from '@nestjs/bullmq';
import * as QRCode from 'qrcode';
import { NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid-1234'),
}));

// Mock external dependencies
jest.mock('qrcode');

describe('TicketsService', () => {
  let service: TicketsService;
  let paystackService: PaystackService;

  const mockPrisma = {
    ticket: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
    event: {
      findUnique: jest.fn(),
    },
    transaction: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    reminder: {
      findMany: jest.fn(),
    },
    // Mocking transaction to execute the callback passed to it
    $transaction: jest.fn().mockImplementation((callback) => callback(mockPrisma)),
  };

  const mockPaystack = {
    initializePayment: jest.fn(),
  };

  const mockMailService = {
    sendTicketConfirmation: jest.fn(),
  };

  const mockEmailQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaystackService, useValue: mockPaystack },
        { provide: MailService, useValue: mockMailService },
        { provide: getQueueToken('email-queue'), useValue: mockEmailQueue },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
    paystackService = module.get<PaystackService>(PaystackService);

    mockPrisma.reminder.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyTicket', () => {
    it('should verify and update ticket successfully', async () => {
      const ticket = { id: 't1', event: { creatorId: 'c1' }, isScanned: false };
      mockPrisma.ticket.findUnique.mockResolvedValue(ticket);
      mockPrisma.ticket.update.mockResolvedValue({ ...ticket, isScanned: true });

      const result = await service.verifyTicket('t1', 'c1');

      expect(result.message).toBe('Ticket verified! Entry granted.');
      expect(mockPrisma.ticket.update).toHaveBeenCalledWith({
        where: { id: 't1' },
        data: { isScanned: true },
      });
    });

    it('should throw ForbiddenException if scanner is not creator', async () => {
      mockPrisma.ticket.findUnique.mockResolvedValue({ event: { creatorId: 'wrong-id' } });

      await expect(service.verifyTicket('t1', 'c1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('purchaseTicket', () => {
    it('should create a free ticket, send confirmation email and schedule reminders if price is 0', async () => {
      const event = {
        id: 'e1',
        title: 'Free Event',
        date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10), // 10 days from now
        price: 0,
        capacity: 10,
        reminderOffsets: [1440], // 1 day before
        _count: { tickets: 0 },
      };
      mockPrisma.event.findUnique.mockResolvedValue(event);
      mockPrisma.ticket.findUnique.mockResolvedValue(null); // No existing ticket
      mockPrisma.ticket.create.mockResolvedValue({ id: 't1' });
      (QRCode.toDataURL as jest.Mock).mockResolvedValue('data:image/png;base64,...');

      const result = await service.purchaseTicket('e1', 'u1', 'test@test.com');

      expect(result.message).toBe('Free ticket claimed successfully!');
      expect(mockPrisma.ticket.create).toHaveBeenCalled();
      expect(mockMailService.sendTicketConfirmation).toHaveBeenCalledWith(
        'test@test.com',
        'Free Event',
        't1',
        'data:image/png;base64,...',
      );
      expect(mockEmailQueue.add).toHaveBeenCalledWith(
        'event-reminder',
        { email: 'test@test.com', eventTitle: 'Free Event' },
        expect.objectContaining({ delay: expect.any(Number) }),
      );
    });

    it('should throw ConflictException if ticket already purchased', async () => {
      const event = { id: 'e1', price: 0, capacity: 10, _count: { tickets: 0 } };
      mockPrisma.event.findUnique.mockResolvedValue(event);
      mockPrisma.ticket.findUnique.mockResolvedValue({ id: 'exists' });

      await expect(service.purchaseTicket('e1', 'u1', 'test@test.com')).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if event is sold out', async () => {
      const event = { id: 'e1', price: 0, capacity: 1, _count: { tickets: 1 } };
      mockPrisma.event.findUnique.mockResolvedValue(event);

      await expect(service.purchaseTicket('e1', 'u1', 'test@test.com')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if event does not exist', async () => {
      mockPrisma.event.findUnique.mockResolvedValue(null);

      await expect(service.purchaseTicket('e1', 'u1', 'test@test.com')).rejects.toThrow(NotFoundException);
    });

    it('should kick off the Paystack flow for paid events', async () => {
      const event = { id: 'e1', title: 'Paid Event', price: 5000, capacity: 10, _count: { tickets: 0 } };
      mockPrisma.event.findUnique.mockResolvedValue(event);
      mockPrisma.ticket.findUnique.mockResolvedValue(null);
      mockPrisma.transaction.create.mockResolvedValue({});
      mockPaystack.initializePayment.mockResolvedValue('https://checkout.paystack.com/abc');

      const result = await service.purchaseTicket('e1', 'u1', 'test@test.com');

      expect(mockPrisma.transaction.create).toHaveBeenCalled();
      expect(paystackService.initializePayment).toHaveBeenCalledWith(
        'test@test.com',
        5000,
        'TKT-mock-uuid-1234',
        'e1',
        'u1',
        'https://eventful-frontend-mu.vercel.app/payment/success',
      );
      expect(result.authorization_url).toBe('https://checkout.paystack.com/abc');
      expect(mockMailService.sendTicketConfirmation).not.toHaveBeenCalled();
    });
  });

  describe('fulfillTicket', () => {
    it('should successfully fulfill a paid ticket and send the confirmation email', async () => {
      const transaction = {
        id: 'tx1',
        status: 'PENDING',
        userId: 'u1',
        eventId: 'e1',
        event: {
          id: 'e1',
          title: 'Paid Event',
          date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 10),
          reminderOffsets: [],
        },
        user: { id: 'u1', email: 'test@test.com' },
      };
      mockPrisma.transaction.findUnique.mockResolvedValue(transaction);
      mockPrisma.transaction.update.mockResolvedValue({ ...transaction, status: 'SUCCESS' });
      mockPrisma.ticket.create.mockResolvedValue({ id: 't1' });
      (QRCode.toDataURL as jest.Mock).mockResolvedValue('qr_code_url');

      const result = await service.fulfillTicket('ref123');

      expect(result).toEqual(expect.objectContaining({ id: 't1', qrCode: 'qr_code_url' }));
      expect(mockPrisma.transaction.update).toHaveBeenCalled();
      expect(mockMailService.sendTicketConfirmation).toHaveBeenCalledWith(
        'test@test.com',
        'Paid Event',
        't1',
        'qr_code_url',
      );
    });

    it('should ignore if transaction already SUCCESS', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({ status: 'SUCCESS' });

      const result = await service.fulfillTicket('ref123');
      expect(result).toBeUndefined();
    });
  });

  describe('getMyTickets', () => {
    it('should return tickets for the given user, including event details', async () => {
      const tickets = [{ id: 't1', event: { id: 'e1', title: 'Event 1' } }];
      mockPrisma.ticket.findMany.mockResolvedValue(tickets);

      const result = await service.getMyTickets('u1');

      expect(mockPrisma.ticket.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        include: { event: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(tickets);
    });
  });
});
