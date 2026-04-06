import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { DecryptedBallotsService } from './decrypted-ballots.service';

@Controller('decrypted-ballots')
export class DecryptedBallotsController {
  constructor(
    private readonly decryptedBallotsService: DecryptedBallotsService,
  ) {}

  @Get()
  findAll(
    @Query('voteSubmissionId') voteSubmissionId?: string,
    @Query('isValid') isValid?: string,
  ) {
    return this.decryptedBallotsService.findAll({ voteSubmissionId, isValid });
  }

  @Get(':id')
  findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.decryptedBallotsService.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      voteSubmissionId: string;
      candidateKeys: unknown;
      nonce: string;
      isValid: boolean;
      validatedAt?: string | null;
    },
  ) {
    return this.decryptedBallotsService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body()
    body: Partial<{
      voteSubmissionId: string;
      candidateKeys: unknown;
      nonce: string;
      isValid: boolean;
      validatedAt?: string | null;
    }>,
  ) {
    return this.decryptedBallotsService.update(id, body);
  }
}

