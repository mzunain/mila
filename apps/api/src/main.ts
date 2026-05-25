import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
      const allowedOrigins = new Set([
        webOrigin,
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
      ]);

      if (
        !origin ||
        allowedOrigins.has(origin) ||
        origin.startsWith('chrome-extension://')
      ) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useWebSocketAdapter(new WsAdapter(app));
  app.setGlobalPrefix('api');

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
  await app.listen(port);
}
void bootstrap();
