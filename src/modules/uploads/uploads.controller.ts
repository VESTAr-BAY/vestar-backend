import {
  BadRequestException,
  Controller,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { diskStorage } from 'multer';

const uploadDirectory = join(process.cwd(), 'uploads', 'candidate-images');

@Controller('uploads')
export class UploadsController {
  @Post('candidate-image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, callback) => {
          mkdirSync(uploadDirectory, { recursive: true });
          callback(null, uploadDirectory);
        },
        filename: (_req, file, callback) => {
          const safeExtension = extname(file.originalname || '').slice(0, 16) || '.png';
          callback(null, `${Date.now()}-${randomUUID()}${safeExtension}`);
        },
      }),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
      fileFilter: (_req, file, callback) => {
        callback(null, file.mimetype.startsWith('image/'));
      },
    }),
  )
  uploadCandidateImage(
    @UploadedFile() file: { filename: string } | undefined,
    @Req() request: Request,
  ) {
    if (!file) {
      throw new BadRequestException('이미지 파일을 업로드하세요.');
    }

    const baseUrl = `${request.protocol}://${request.get('host')}`;
    return {
      url: `${baseUrl}/uploads/candidate-images/${file.filename}`,
    };
  }
}
