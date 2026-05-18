import { INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('Mila API (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    process.env.LLM_PROVIDER = 'mock';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useWebSocketAdapter(new WsAdapter(app));
    app.setGlobalPrefix('api');
    await app.init();
  });

  it('/api/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect(({ body }) => {
        const responseBody = body as { status?: unknown; service?: unknown };
        expect(responseBody.status).toBe('ok');
        expect(responseBody.service).toBe('mila-api');
      });
  });

  it('/api/sessions (POST)', () => {
    return request(app.getHttpServer())
      .post('/api/sessions')
      .send({ title: 'E2E sync', outputLanguage: 'en' })
      .expect(201)
      .expect(({ body }) => {
        const responseBody = body as {
          session?: { title?: unknown };
          notes?: { outputLanguage?: unknown };
        };
        expect(responseBody.session?.title).toBe('E2E sync');
        expect(responseBody.notes?.outputLanguage).toBe('en');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
