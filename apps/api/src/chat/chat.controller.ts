import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { ChatRequest, ChatResponse } from '@mila/shared';
import { ChatService } from './chat.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { PublicUser } from '../auth/auth.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async chat(
    @CurrentUser() user: PublicUser,
    @Body() body: ChatRequest,
  ): Promise<ChatResponse> {
    const message = await this.chatService.respond(user.id, body);
    return { message };
  }
}
