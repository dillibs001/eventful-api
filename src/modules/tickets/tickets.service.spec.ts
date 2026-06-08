import { Test, TestingModule } from '@nestjs/testing';
import { TicketsService } from './tickets.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaystackService } from '../paystack/paystack.service';
import * as QRCode from 'qrcode';
import * as uuid from 'uuid';
import { NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid-1234'),
}));

// Mock external dependencies
jest.mock('qrcode');
// jest.mock('uuid');

describe('TicketsService', () => {
  let service: TicketsService;
  let prisma: PrismaService;
  let paystackService: PaystackService;

  const mockPrisma = {
    ticket: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    event: {
      findUnique: jest.fn(),
    },
    transaction: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    // Mocking transaction to execute the callback passed to it
    $transaction: jest.fn().mockImplementation((callback) => callback(mockPrisma)),
  };

  const mockPaystack = {
    initializePayment: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PaystackService, useValue: mockPaystack },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
    prisma = module.get<PrismaService>(PrismaService);
    paystackService = module.get<PaystackService>(PaystackService);
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
    it('should create a free ticket if price is 0', async () => {
      const event = { id: 'e1', price: 0, capacity: 10, _count: { tickets: 0 } };
      mockPrisma.event.findUnique.mockResolvedValue(event);
      mockPrisma.ticket.findUnique.mockResolvedValue(null); // No existing ticket
      mockPrisma.ticket.create.mockResolvedValue({ id: 't1' });
      (QRCode.toDataURL as jest.Mock).mockResolvedValue('data:image/png;base64,...');

      const result = await service.purchaseTicket('e1', 'u1', 'test@test.com');

      expect(result.message).toBe('Free ticket claimed successfully!');
      expect(mockPrisma.ticket.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if ticket already purchased', async () => {
const event = { id: 'e1', price: 0, capacity: 10, _count: { tickets: 0 } };      
mockPrisma.event.findUnique.mockResolvedValue(event);
      mockPrisma.ticket.findUnique.mockResolvedValue({ id: 'exists' });

      await expect(service.purchaseTicket('e1', 'u1', 'test@test.com'))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('fulfillTicket', () => {
    it('should successfully fulfill a paid ticket', async () => {
      const transaction = { id: 'tx1', status: 'PENDING', userId: 'u1', eventId: 'e1' };
      mockPrisma.transaction.findUnique.mockResolvedValue(transaction);
      mockPrisma.transaction.update.mockResolvedValue({ ...transaction, status: 'SUCCESS' });
      mockPrisma.ticket.create.mockResolvedValue({ id: 't1' });
      (QRCode.toDataURL as jest.Mock).mockResolvedValue('qr_code_url');

      const result = await service.fulfillTicket('ref123');

      expect(result).toEqual({ id: 't1' });
      expect(mockPrisma.transaction.update).toHaveBeenCalled();
    });

    it('should ignore if transaction already SUCCESS', async () => {
      mockPrisma.transaction.findUnique.mockResolvedValue({ status: 'SUCCESS' });

      const result = await service.fulfillTicket('ref123');
      expect(result).toBeUndefined();
    });
  });
});