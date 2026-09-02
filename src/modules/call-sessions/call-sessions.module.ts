import { Module } from '@nestjs/common';

import { CallSessionsGateway } from './call-sessions.gateway.js';
import { CallSessionsService } from './call-sessions.service.js';

@Module({
  providers: [CallSessionsService, CallSessionsGateway],
})
export class CallSessionsModule {}
