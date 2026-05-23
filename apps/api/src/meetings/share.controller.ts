import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { MeetingsService } from './meetings.service';

@Controller('share')
export class ShareController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Get(':token')
  async get(@Param('token') token: string) {
    const session = await this.meetingsService.getSharedSession(token);
    if (!session) throw new NotFoundException('Share link not found');
    return session;
  }
}
