export interface PaystackWebhookBody {
  event: string;
  data: {
    reference: string;
    status: string;
    amount: number;
    metadata: {
      eventId: string;
      userId: string;
      email: string;
    };
  };
}