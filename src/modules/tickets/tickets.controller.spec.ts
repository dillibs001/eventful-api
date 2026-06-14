import { Test, TestingModule } from '@nestjs/testing';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid-1234'),
}));

describe('TicketsController', () => {
  let controller: TicketsController;
  let service: TicketsService;

  // 1. Create a "fake" service that matches the real one's method names
  const mockTicketsService = {
    verifyTicket: jest.fn(),
    purchaseTicket: jest.fn(),
    getMyTickets: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketsController],
      providers: [
        {
          provide: TicketsService,
          useValue: mockTicketsService,
        },
      ],
    }).compile();

    controller = module.get<TicketsController>(TicketsController);
    service = module.get<TicketsService>(TicketsService);
  });

  afterEach(() => {
    jest.clearAllMocks(); // Resets call counters between tests
  });

  describe('verifyTicket', () => {
    it('should call ticketsService.verifyTicket with correct parameters', async () => {
      // Setup
      const mockTicketId = 'ticket-123';
      const mockReq = {
        user: { userId: 'creator-456', email: 'creator@test.com', role: 'CREATOR' },
      } as any; // Using 'as any' here for the mock req object is standard practice in unit tests

      mockTicketsService.verifyTicket.mockResolvedValue({ message: 'Success' });

      // Action
      const result = await controller.verifyTicket(mockTicketId, mockReq);

      // Assert
      expect(service.verifyTicket).toHaveBeenCalledWith(mockTicketId, 'creator-456');
      expect(result).toEqual({ message: 'Success' });
    });
  });

  describe('purchaseTicket', () => {
    it('should call ticketsService.purchaseTicket with correct parameters', async () => {
      // Setup
      const createTicketDto: CreateTicketDto = { eventId: 'event-789' };
      const mockReq = {
        user: { userId: 'user-111', email: 'user@test.com', role: 'EVENTEE' },
      } as any;

      mockTicketsService.purchaseTicket.mockResolvedValue({ message: 'Checkout' });

      // Action
      const result = await controller.purchaseTicket(createTicketDto, mockReq);

      // Assert
      expect(service.purchaseTicket).toHaveBeenCalledWith(
        'event-789',
        'user-111',
        'user@test.com'
      );
      expect(result).toEqual({ message: 'Checkout' });
    });
  });

  describe('getMyTickets', () => {
    it('should call ticketsService.getMyTickets with the user id', async () => {
      const mockReq = {
        user: { userId: 'user-111', email: 'user@test.com', role: 'EVENTEE' },
      } as any;

      mockTicketsService.getMyTickets.mockResolvedValue([{ id: 't1' }]);

      const result = await controller.getMyTickets(mockReq);

      expect(service.getMyTickets).toHaveBeenCalledWith('user-111');
      expect(result).toEqual([{ id: 't1' }]);
    });
  });
});