import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type {
  CreateMeetingRequest,
  MeetingNotes,
  ShareLinkResponse,
} from '@mila/shared';
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
      templateId: body.templateId,
    });
  }

  @Get()
  listSessions(@CurrentUser() user: PublicUser) {
    return this.meetingsService.listSessions(user.id);
  }

  @Get('actions/inbox')
  getActionInbox(@CurrentUser() user: PublicUser) {
    return this.meetingsService.getActionInbox(user.id);
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

  @Post(':id/complete')
  completeSession(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MeetingNotes> {
    return this.meetingsService.completeSession(user.id, id);
  }

  @Post(':id/share')
  async share(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ShareLinkResponse> {
    const shareToken = await this.meetingsService.createShareToken(user.id, id);
    return {
      sessionId: id,
      shareToken,
      url: `/share/${shareToken}`,
    };
  }

  @Delete(':id/share')
  @HttpCode(204)
  async revokeShare(
    @CurrentUser() user: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.meetingsService.revokeShareToken(user.id, id);
  }
}
