import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service';
import { MailerService } from '@nestjs-modules/mailer';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InternalServerErrorException } from '@nestjs/common';

describe('MailService', () => {
  let service: MailService;
  let mailerService: MailerService;
  let emailQueue: Queue;

  // 1. Create Mocks
  const mockMailerService = {
    sendMail: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        { provide: MailerService, useValue: mockMailerService },
        { provide: getQueueToken('email-queue'), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
    mailerService = module.get<MailerService>(MailerService);
    emailQueue = module.get<Queue>(getQueueToken('email-queue'));

    // Silence console logs during tests to keep the terminal pristine
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks(); // Restore the console after the tests run
  });

  describe('sendTicketEmail', () => {
    it('should call mailerService.sendMail with correct parameters', async () => {
      mockMailerService.sendMail.mockResolvedValue({ messageId: '123' });

      // ⚠️ Updated to pass 4 arguments
      await service.sendTicketEmail(
        'test@test.com', 
        'Test Event', 
        'ticket-123', 
        'data:image/png;base64,mock'
      );

      expect(mailerService.sendMail).toHaveBeenCalledWith({
        to: 'test@test.com',
        subject: expect.stringContaining('Test Event'),
        template: './ticket-confirmation',
        context: { 
          eventName: 'Test Event',
          ticketId: 'ticket-123'
        },
        attachments: [
          {
            filename: 'ticket-qrcode.png',
            path: 'data:image/png;base64,mock',
            cid: 'qrcode',
          },
        ],
      });
    });

    it('should throw InternalServerErrorException when email fails', async () => {
      mockMailerService.sendMail.mockRejectedValue(new Error('SMTP Error'));

      // ⚠️ Updated to pass 4 arguments
      await expect(
        service.sendTicketEmail('test@test.com', 'Event', 'ticket-123', 'mock-qr-url')
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('sendTicketConfirmation', () => {
    it('should add a job to the email queue', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-1' });

      // ⚠️ Updated to pass 4 arguments
      const result = await service.sendTicketConfirmation(
        'test@test.com', 
        'Event Name', 
        'ticket-123', 
        'mock-qr-url'
      );

      expect(emailQueue.add).toHaveBeenCalledWith('ticket-confirmation', {
        email: 'test@test.com',
        eventName: 'Event Name',
        ticketId: 'ticket-123',
        qrCodeDataUrl: 'mock-qr-url', // ⚠️ Added to the expected payload
      });
      expect(result.message).toBe('Email job added to queue');
    });
  });

  // ⚠️ New test block to cover the background reminder emails!
  describe('sendReminderEmail', () => {
    it('should call mailerService.sendMail with the reminder template', async () => {
      mockMailerService.sendMail.mockResolvedValue({ messageId: '456' });

      await service.sendReminderEmail('test@test.com', 'Test Event');

      expect(mailerService.sendMail).toHaveBeenCalledWith({
        to: 'test@test.com',
        subject: expect.stringContaining('Test Event'),
        template: './event-reminder',
        context: { 
          eventName: 'Test Event' 
        },
      });
    });
  });
});