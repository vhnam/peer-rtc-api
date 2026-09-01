import { Module } from '@nestjs/common';
import { AuthModule } from '@thallesp/nestjs-better-auth';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { auth } from './modules/auth/auth.js';
import { ConsultRequestsModule } from './modules/consult-requests/consult-requests.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, AuthModule.forRoot({ auth }), ConsultRequestsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
