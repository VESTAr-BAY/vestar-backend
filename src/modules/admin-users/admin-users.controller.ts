import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { AdminUsersService } from './admin-users.service';

@Controller('admin-users')
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  findAll() {
    return this.adminUsersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.adminUsersService.findOne(id);
  }

  @Post()
  create(
    @Body() body: { email: string; passwordHash: string; role: string },
  ) {
    return this.adminUsersService.create(body);
  }

  @Patch(':id')
  update(
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body()
    body: Partial<{ email: string; passwordHash: string; role: string }>,
  ) {
    return this.adminUsersService.update(id, body);
  }
}

