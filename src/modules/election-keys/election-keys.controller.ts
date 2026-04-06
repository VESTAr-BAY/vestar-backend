import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { ElectionKeysService } from './election-keys.service';

@Controller('election-keys')
export class ElectionKeysController {
  constructor(private readonly electionKeysService: ElectionKeysService) {}

  @Get()
  findAll() {
    return this.electionKeysService.findAll();
  }

  @Get('by-commitment')
  findByCommitmentHash(@Query('hash') hash: string) {
    return this.electionKeysService.findByCommitmentHash(hash);
  }

  @Get(':id')
  findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.electionKeysService.findOne(id);
  }

  @Post()
  create(
    @Body()
    body: {
      electionId?: string | null;
      publicKey: string;
      privateKeyCommitmentHash: string;
      privateKeyEncrypted: string;
      isRevealed?: boolean;
      revealedAt?: string | null;
    },
  ) {
    return this.electionKeysService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body()
    body: Partial<{
      electionId?: string | null;
      publicKey: string;
      privateKeyCommitmentHash: string;
      privateKeyEncrypted: string;
      isRevealed?: boolean;
      revealedAt?: string | null;
    }>,
  ) {
    return this.electionKeysService.update(id, body);
  }
}

