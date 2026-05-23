import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { CreateMeetingRequest } from '@mila/shared';
import { MeetingsService } from './meetings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { PublicUser } from '../auth/auth.service';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Post()
  createSession(
    @CurrentUser() user: PublicUser,
    @Body() body: CreateMeetingRequest,
  ) {
    return this.meetingsService.createSession(user.id, {
      title: body.title,
      outputLanguage: body.outputLanguage,
      source: body.source,
      autoStarted: body.autoStarted,
      externalMeeting: body.externalMeeting,
    });
  }

  @Get()
  listSessions(@CurrentUser() user: PublicUser) {
    return this.meetingsService.listSessions(user.id);
  }

  @Get(':id')
  async getSession(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const session = await this.meetingsService.getSessionDetail(user.id, id);

    if (!session) {
      throw new NotFoundException('Meeting session not found');
    }

    return session;
  }
}
