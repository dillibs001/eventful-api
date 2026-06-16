import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.enableCors({
    origin: ['http://localhost:3001', 'https://eventful-frontend-mu.vercel.app'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

  // Build the configuration
  const config = new DocumentBuilder()
    .setTitle('Eventful API')
    .setDescription('The official API documentation for the Event Ticketing platform.')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
    
  
  const document = SwaggerModule.createDocument(app, config);
  

  SwaggerModule.setup('api', app, document); 

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();