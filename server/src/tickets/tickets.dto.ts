import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { TRIAGE_PROMPTS } from '../triage/prompts';

const FAULTS = ['none', 'malformed_output', 'rate_limit'] as const;

export class TriageQueryDto {
  @ApiPropertyOptional({ enum: Object.keys(TRIAGE_PROMPTS) })
  @IsOptional()
  @IsIn(Object.keys(TRIAGE_PROMPTS))
  promptVersion?: string;

  @ApiPropertyOptional({
    enum: FAULTS,
    description:
      'Injects a deliberate failure so the recovery path can be watched. The retry logic is otherwise invisible.',
  })
  @IsOptional()
  @IsIn(FAULTS)
  fault?: string;

  @ApiPropertyOptional({ description: 'Set to "true" to bypass the cache and pay for the call again' })
  @IsOptional()
  @IsIn(['true', 'false'])
  noCache?: string;
}

export class ApproveDraftDto {
  @ApiProperty({ description: 'The reply as edited by the agent, not the model’s original' })
  @IsNotEmpty()
  @MaxLength(8000)
  body!: string;
}
