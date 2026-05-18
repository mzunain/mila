import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import type { CreateMeetingRequest } from '@mila/shared';
import { MeetingsService } from './meetings.service';

@Controller('sessions')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Post()
  createSession(@Body() body: CreateMeetingRequest) {
    return this.meetingsService.createSession({
      title: body.title,
      outputLanguage: body.outputLanguage,
      source: body.source,
      autoStarted: body.autoStarted,
      externalMeeting: body.externalMeeting,
    });
  }

  @Get()
  listSessions() {
    return this.meetingsService.listSessions();
  }

  @Get(':id')
  getSession(@Param('id') id: string) {
    const session = this.meetingsService.getSessionDetail(id);

    if (!session) {
      throw new NotFoundException('Meeting session not found');
    }

    return session;
  }
}
