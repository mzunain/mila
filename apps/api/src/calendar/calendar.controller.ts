import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { PublicUser } from '../auth/auth.service';
import { CalendarService, CalendarEvent } from './calendar.service';

interface SyncBody {
  feedUrl?: string;
  ics?: string;
}

@Controller('calendar')
@UseGuards(JwtAuthGuard)
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Post('sync')
  async sync(
    @CurrentUser() _user: PublicUser,
    @Body() body: SyncBody,
  ): Promise<{ events: CalendarEvent[] }> {
    if (body.ics) {
      return { events: this.calendarService.parseIcs(body.ics) };
    }
    if (body.feedUrl) {
      return { events: await this.calendarService.fetchUpcoming(body.feedUrl) };
    }
    throw new BadRequestException('Provide feedUrl or ics body');
  }
}
