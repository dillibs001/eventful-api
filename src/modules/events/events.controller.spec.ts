import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { TicketsService } from '../tickets/tickets.service';
import { CreateEventDto } from './dto/create-event.dto';

// tickets.service.ts (transitively imported via EventsController) pulls in the
// ESM-only `uuid` package, which Jest can't parse without this mock.
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid-1234'),
}));

describe('EventsController', () => {
  let controller: EventsController;
  let eventsService: EventsService;
  let ticketsService: TicketsService;

  const mockEventsService = {
    createEvent: jest.fn(),
    getCreatorDashboard: jest.fn(),
    findByCreator: jest.fn(),
    findAll: jest.fn(),
    getEventById: jest.fn(),
    getShareLinks: jest.fn(),
    getEventAttendees: jest.fn(),
    getEventAnalytics: jest.fn(),
    getEventTransactions: jest.fn(),
    setReminder: jest.fn(),
    getMyReminders: jest.fn(),
    updateEvent: jest.fn(),
    deleteEvent: jest.fn(),
  };

  const mockTicketsService = {
    purchaseTicket: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        { provide: EventsService, useValue: mockEventsService },
        { provide: TicketsService, useValue: mockTicketsService },
      ],
    }).compile();

    controller = module.get<EventsController>(EventsController);
    eventsService = module.get<EventsService>(EventsService);
    ticketsService = module.get<TicketsService>(TicketsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should call eventsService.createEvent with correct parameters', async () => {
      const dto: CreateEventDto = {
        title: 'Tech Fest',
        description: 'Demo',
        date: '2026-12-25',
        capacity: 100,
        price: 0,
        location: 'Lagos',
      };
      const mockReq = { user: { userId: 'creator-123' } } as any;

      mockEventsService.createEvent.mockResolvedValue({ id: 'event-1' });

      const result = await controller.create(dto, mockReq);

      expect(eventsService.createEvent).toHaveBeenCalledWith('creator-123', dto);
      expect(result).toEqual({ id: 'event-1' });
    });
  });

  describe('getDashboard', () => {
    it('should call eventsService.getCreatorDashboard with the creator ID', async () => {
      const mockReq = { user: { userId: 'creator-123' } } as any;
      mockEventsService.getCreatorDashboard.mockResolvedValue({ total: 10 });

      const result = await controller.getDashboard(mockReq);

      expect(eventsService.getCreatorDashboard).toHaveBeenCalledWith('creator-123');
      expect(result).toEqual({ total: 10 });
    });
  });

  describe('getMyEvents', () => {
    it('should call eventsService.findByCreator with the creator ID', async () => {
      const mockReq = { user: { userId: 'creator-123' } } as any;
      mockEventsService.findByCreator.mockResolvedValue([{ id: 'e1' }]);

      const result = await controller.getMyEvents(mockReq);

      expect(eventsService.findByCreator).toHaveBeenCalledWith('creator-123');
      expect(result).toEqual([{ id: 'e1' }]);
    });
  });

  describe('attendEvent', () => {
    it('should extract user info and call ticketsService.purchaseTicket', async () => {
      const mockReq = {
        user: { userId: 'user-123', email: 'user@test.com' },
      } as any;

      mockTicketsService.purchaseTicket.mockResolvedValue({ message: 'Success' });

      const result = await controller.attendEvent('event-999', mockReq);

      expect(ticketsService.purchaseTicket).toHaveBeenCalledWith('event-999', 'user-123', 'user@test.com');
      expect(result).toEqual({ message: 'Success' });
    });
  });

  describe('findAll', () => {
    it('should call eventsService.findAll', async () => {
      mockEventsService.findAll.mockResolvedValue([{ title: 'Event 1' }]);

      const result = await controller.findAll();

      expect(eventsService.findAll).toHaveBeenCalled();
      expect(result).toEqual([{ title: 'Event 1' }]);
    });
  });

  describe('getEvent', () => {
    it('should call eventsService.getEventById', async () => {
      mockEventsService.getEventById.mockResolvedValue({ id: 'e1' });

      const result = await controller.getEvent('e1');

      expect(eventsService.getEventById).toHaveBeenCalledWith('e1');
      expect(result).toEqual({ id: 'e1' });
    });
  });

  describe('getShareLinks', () => {
    it('should call eventsService.getShareLinks', async () => {
      mockEventsService.getShareLinks.mockResolvedValue({ url: 'https://example.com/events/e1', platforms: {} });

      const result = await controller.getShareLinks('e1');

      expect(eventsService.getShareLinks).toHaveBeenCalledWith('e1');
      expect(result.url).toContain('e1');
    });
  });

  describe('getAttendees', () => {
    it('should call eventsService.getEventAttendees with the event id and creator id', async () => {
      const mockReq = { user: { userId: 'creator-123' } } as any;
      mockEventsService.getEventAttendees.mockResolvedValue([{ id: 't1' }]);

      const result = await controller.getAttendees('e1', mockReq);

      expect(eventsService.getEventAttendees).toHaveBeenCalledWith('e1', 'creator-123');
      expect(result).toEqual([{ id: 't1' }]);
    });
  });

  describe('getEventAnalytics', () => {
    it('should call eventsService.getEventAnalytics with the event id and creator id', async () => {
      const mockReq = { user: { userId: 'creator-123' } } as any;
      mockEventsService.getEventAnalytics.mockResolvedValue({ source: 'database', data: {} });

      const result = await controller.getEventAnalytics('e1', mockReq);

      expect(eventsService.getEventAnalytics).toHaveBeenCalledWith('e1', 'creator-123');
      expect(result).toEqual({ source: 'database', data: {} });
    });
  });

  describe('getEventTransactions', () => {
    it('should call eventsService.getEventTransactions with the event id and creator id', async () => {
      const mockReq = { user: { userId: 'creator-123' } } as any;
      mockEventsService.getEventTransactions.mockResolvedValue([{ id: 'tx1' }]);

      const result = await controller.getEventTransactions('e1', mockReq);

      expect(eventsService.getEventTransactions).toHaveBeenCalledWith('e1', 'creator-123');
      expect(result).toEqual([{ id: 'tx1' }]);
    });
  });

  describe('setReminder', () => {
    it('should call eventsService.setReminder with the user id, event id and dto', async () => {
      const mockReq = { user: { userId: 'user-123' } } as any;
      const dto = { offsetMinutes: 60 };
      mockEventsService.setReminder.mockResolvedValue({ id: 'r1' });

      const result = await controller.setReminder('e1', dto, mockReq);

      expect(eventsService.setReminder).toHaveBeenCalledWith('user-123', 'e1', dto);
      expect(result).toEqual({ id: 'r1' });
    });
  });

  describe('getMyReminders', () => {
    it('should call eventsService.getMyReminders with the user id and event id', async () => {
      const mockReq = { user: { userId: 'user-123' } } as any;
      mockEventsService.getMyReminders.mockResolvedValue([{ id: 'r1' }]);

      const result = await controller.getMyReminders('e1', mockReq);

      expect(eventsService.getMyReminders).toHaveBeenCalledWith('user-123', 'e1');
      expect(result).toEqual([{ id: 'r1' }]);
    });
  });

  describe('update', () => {
    it('should call eventsService.updateEvent', async () => {
      const dto = { title: 'Updated' };
      mockEventsService.updateEvent.mockResolvedValue({ id: 'e1', ...dto });

      const result = await controller.update('e1', dto);

      expect(eventsService.updateEvent).toHaveBeenCalledWith('e1', dto);
      expect(result).toEqual({ id: 'e1', ...dto });
    });
  });

  describe('remove', () => {
    it('should call eventsService.deleteEvent', async () => {
      mockEventsService.deleteEvent.mockResolvedValue({ id: 'e1' });

      const result = await controller.remove('e1');

      expect(eventsService.deleteEvent).toHaveBeenCalledWith('e1');
      expect(result).toEqual({ id: 'e1' });
    });
  });
});
