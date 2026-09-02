import { readFileSync } from 'node:fs';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { parseCorsOrigins } from './common/cors-origins.js';
import { SocketIoAdapter } from './common/socket-io.adapter.js';
import { env } from './env.js';

function httpsOptions() {
  if (!env.SSL_KEY_PATH || !env.SSL_CERT_PATH) {
    return undefined;
  }

  return {
    key: readFileSync(env.SSL_KEY_PATH),
    cert: readFileSync(env.SSL_CERT_PATH),
  };
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
    httpsOptions: httpsOptions(),
  });
  app.enableCors({
    origin: parseCorsOrigins(),
    credentials: true,
  });
  app.useWebSocketAdapter(new SocketIoAdapter(app));
  const port = env.PORT ?? 8080;
  await app.listen(port);
  Logger.log(`Listening on ${await app.getUrl()}`, 'Bootstrap');
}
await bootstrap();
