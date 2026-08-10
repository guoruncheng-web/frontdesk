import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

/**
 * Builds the application without listening on a port, so the same wiring backs
 * both `npm run dev` (src/main.ts) and the Vercel function (api/index.js).
 */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });

  app.setGlobalPrefix('api');

  app.useGlobalFilters(new AllExceptionsFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.enableCors({
    origin: allowedOrigins(),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86_400,
  });

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Frontdesk API')
      .setDescription(
        'AI triage for support inboxes. Every endpoint outside /auth and /demo is scoped to the organization encoded in the bearer token. The triage and draft endpoints return server-sent events rather than JSON, so the tokens and retries can be watched as they happen.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.init();
  return app;
}

/**
 * `*` would be rejected by browsers alongside credentials and would also let any
 * site drive the API with a stolen token, so origins are allow-listed.
 */
function allowedOrigins(): string[] | boolean {
  const configured = process.env.APP_CORS_ALLOWED_ORIGINS;

  if (!configured) {
    return ['http://localhost:3000'];
  }

  const origins = configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.includes('*') ? true : origins;
}
