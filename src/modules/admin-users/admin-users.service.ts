import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type CreateAdminUserDto = {
  email: string;
  passwordHash: string;
  role: string;
};

type UpdateAdminUserDto = Partial<CreateAdminUserDto>;

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.adminUser.findMany({
      orderBy: { id: 'asc' },
    });
  }

  findOne(id: bigint) {
    return this.prisma.adminUser.findUnique({
      where: { id },
    });
  }

  create(data: CreateAdminUserDto) {
    return this.prisma.adminUser.create({ data });
  }

  update(id: bigint, data: UpdateAdminUserDto) {
    return this.prisma.adminUser.update({
      where: { id },
      data,
    });
  }
}

