import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthResponseDto } from '../auth/dto/auth.dto';
import { DemoService } from './demo.service';

@ApiTags('demo')
@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Post('session')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a private inbox of sample tickets and sign into it',
    description:
      'Deliberately unauthenticated — it is what the "Open the demo" button calls. The inbox is deleted 24 hours later.',
  })
  session(): Promise<AuthResponseDto> {
    return this.demo.createSandbox();
  }
}
