import { Test, TestingModule } from '@nestjs/testing';
import { PaystackService } from './paystack.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InternalServerErrorException } from '@nestjs/common';
import { of, throwError } from 'rxjs';

describe('PaystackService', () => {
  let service: PaystackService;
  let httpService: HttpService;

  // 1. Mock the HttpService
  const mockHttpService = {
    post: jest.fn(),
  };

  beforeEach(async () => {
    // Set environment variable for the test
    process.env.PAYSTACK_SECRET_KEY = 'test_secret_key';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaystackService,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: { get: (key: string) => process.env[key] } },
      ],
    }).compile();

    service = module.get<PaystackService>(PaystackService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initializePayment', () => {
    it('should return authorization_url on success', async () => {
      // Setup mock successful response
      const mockResponse = {
        data: {
          status: true,
          data: { authorization_url: 'https://checkout.paystack.com/123' },
        },
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      const result = await service.initializePayment('user@test.com', 5000, 'ref123', 'event1', 'user1');

      expect(result).toBe('https://checkout.paystack.com/123');
      expect(httpService.post).toHaveBeenCalled();
    });

    it('should throw InternalServerErrorException if Paystack status is false', async () => {
      // Setup mock failed response (Paystack returns 200 OK but with status: false)
      const mockResponse = {
        data: {
          status: false,
          message: 'Invalid amount',
        },
      };

      mockHttpService.post.mockReturnValue(of(mockResponse));

      await expect(service.initializePayment('user@test.com', -100, 'ref123', 'event1', 'user1'))
        .rejects
        .toThrow(InternalServerErrorException);
    });

    it('should throw InternalServerErrorException if HTTP request fails', async () => {
      // Simulate network error
      mockHttpService.post.mockReturnValue(
        throwError(() => ({ response: { data: 'Network Error' } }))
      );

      await expect(service.initializePayment('user@test.com', 5000, 'ref123', 'event1', 'user1'))
        .rejects
        .toThrow(InternalServerErrorException);
    });
  });
});