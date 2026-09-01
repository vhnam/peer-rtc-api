import { Module } from '@nestjs/common';

import { ConsultRequestsController } from './consult-requests.controller.js';
import { ConsultRequestsService } from './consult-requests.service.js';

@Module({
  controllers: [ConsultRequestsController],
  providers: [ConsultRequestsService],
})
export class ConsultRequestsModule {}
