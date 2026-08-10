import { Module } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import { TriageService } from '../triage/triage.service';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  controllers: [TicketsController],
  providers: [TicketsService, TriageService, LlmService],
})
export class TicketsModule {}
