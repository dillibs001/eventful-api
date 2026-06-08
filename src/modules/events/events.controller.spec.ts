import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';

describe('EventsController', () => {
  let controller: EventsController;
  let service: EventsService;

  // 1. Create a "fake" service that matches the real one's method names
  const mockEventsService = {
    createEvent: jest.fn(),
    getCreatorDashboard: jest.fn(),
    registerForEvent: jest.fn(),
    findAll: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        {
          provide: EventsService,
          useValue: mockEventsService,
        },
      ],
    }).compile();

    controller = module.get<EventsController>(EventsController);
    service = module.get<EventsService>(EventsService);
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
        location: 'Lagos' 
      };
      const mockReq = { user: { sub: 'creator-123' } } as any;

      mockEventsService.createEvent.mockResolvedValue({ id: 'event-1' });

      const result = await controller.create(dto, mockReq);

      expect(service.createEvent).toHaveBeenCalledWith('creator-123', dto);
      expect(result).toEqual({ id: 'event-1' });
    });
  });

  describe('getDashboard', () => {
    it('should call eventsService.getCreatorDashboard with the creator ID', async () => {
      const mockReq = { user: { sub: 'creator-123' } } as any;
      mockEventsService.getCreatorDashboard.mockResolvedValue({ total: 10 });

      const result = await controller.getDashboard(mockReq);

      expect(service.getCreatorDashboard).toHaveBeenCalledWith('creator-123');
      expect(result).toEqual({ total: 10 });
    });
  });

  describe('attendEvent', () => {
    it('should extract user info and call registerForEvent', async () => {
      const mockReq = { 
        user: { sub: 'user-123', email: 'user@test.com' } 
      } as any;
      
      mockEventsService.registerForEvent.mockResolvedValue({ message: 'Success' });

      const result = await controller.attendEvent('event-999', mockReq);

      expect(service.registerForEvent).toHaveBeenCalledWith(
        'event-999', 
        'user-123', 
        'user@test.com'
      );
      expect(result).toEqual({ message: 'Success' });
    });
  });

  describe('findAll', () => {
    it('should call eventsService.findAll', async () => {
      mockEventsService.findAll.mockResolvedValue([{ title: 'Event 1' }]);
      
      const result = await controller.findAll();
      
      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual([{ title: 'Event 1' }]);
    });
  });
});