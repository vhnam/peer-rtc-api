import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Session, type UserSession } from '@thallesp/nestjs-better-auth';

import { auth } from '../auth/auth.js';
import {
  parseCreateConsultRequestBody,
  parseListConsultRequestQuery,
  parseUpdateConsultRequestBody,
} from './consult-request.dto.js';
import { ConsultRequestsService } from './consult-requests.service.js';

@Controller('api/consult-requests')
export class ConsultRequestsController {
  constructor(private readonly consultRequests: ConsultRequestsService) {}

  @Get()
  list(
    @Session() session: UserSession<typeof auth>,
    @Query() raw: Record<string, string | undefined>,
  ) {
    const query = parseListConsultRequestQuery(raw);
    return this.consultRequests.list(session, query);
  }

  @Get(':id')
  get(@Session() session: UserSession<typeof auth>, @Param('id') id: string) {
    return this.consultRequests.get(session, id);
  }

  @Post()
  @HttpCode(201)
  create(@Session() session: UserSession<typeof auth>, @Body() body: unknown) {
    return this.consultRequests.create(
      session,
      parseCreateConsultRequestBody(body),
    );
  }

  @Patch(':id')
  update(
    @Session() session: UserSession<typeof auth>,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.consultRequests.update(
      session,
      id,
      parseUpdateConsultRequestBody(body),
    );
  }
}
