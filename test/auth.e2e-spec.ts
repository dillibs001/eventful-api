import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest'; 
import { AppModule } from './../src/app.module';


describe('Authentication Flow (e2e)', () => {
  let app: INestApplication;
  
  // generate a unique email every time the test runs so the database 
    // doesn't complain about duplicate emails
  const testEmail = `testuser-${Date.now()}@example.com`;
  const testPassword = 'supersecretpassword';

  // 1. THIS RUNS BEFORE THE TESTS START
  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    //   include the ValidationPipe here too, or  DTOs will fail!
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

   //REGISTRATION ROUTE
  it('/auth/register (POST) - should create user and return token', () => {
    return request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: testEmail, password: testPassword, role: 'CREATOR' })
      .expect(201) // We expect a 201 Created status
      .expect((res) => {
        //  expect the body to have a property called 'access_token'
        expect(res.body.access_token).toBeDefined();
      });
  });

  //  TEST THE LOGIN ROUTE
  it('/auth/login (POST) - should log in and return token', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(201) 
      .expect((res) => {
        expect(res.body.access_token).toBeDefined();
      });
  });

  //  THIS RUNS AFTER THE TESTS FINISH
  afterAll(async () => {
    await app.close(); // Shut down the invisible server
  });
});