import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { PreparePrivateElectionDto } from '../dto/prepare-private-election.dto';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return (
    value === undefined || value === null || typeof value === 'string'
  );
}

@Injectable()
export class PreparePrivateElectionPipe
  implements PipeTransform<unknown, PreparePrivateElectionDto>
{
  transform(value: unknown): PreparePrivateElectionDto {
    if (!value || typeof value !== 'object') {
      throw new BadRequestException('Request body must be an object');
    }

    const body = value as Record<string, unknown>;

    if (!isNonEmptyString(body.seriesPreimage)) {
      throw new BadRequestException('seriesPreimage must be a non-empty string');
    }

    if (!isNonEmptyString(body.title)) {
      throw new BadRequestException('title must be a non-empty string');
    }

    if (!isOptionalString(body.seriesCoverImageUrl)) {
      throw new BadRequestException(
        'seriesCoverImageUrl must be a string, null, or undefined',
      );
    }

    if (!isOptionalString(body.coverImageUrl)) {
      throw new BadRequestException(
        'coverImageUrl must be a string, null, or undefined',
      );
    }

    return {
      seriesPreimage: body.seriesPreimage,
      seriesCoverImageUrl:
        body.seriesCoverImageUrl === undefined ? undefined : body.seriesCoverImageUrl,
      title: body.title,
      coverImageUrl: body.coverImageUrl === undefined ? undefined : body.coverImageUrl,
    };
  }
}
