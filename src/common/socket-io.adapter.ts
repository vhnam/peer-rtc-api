import type { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';

import { parseCorsOrigins } from './cors-origins.js';

export class SocketIoAdapter extends IoAdapter {
  constructor(app: INestApplication) {
    super(app);
  }

  override createIOServer(port: number, options?: ServerOptions) {
    if (options) {
      options.cors = {
        origin: parseCorsOrigins(),
        credentials: true,
      };
    }
    return super.createIOServer(port, options);
  }
}
