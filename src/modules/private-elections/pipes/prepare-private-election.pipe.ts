import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import {
  PreparePrivateElectionCandidateDto,
  PreparePrivateElectionDto,
} from '../dto/prepare-private-election.dto';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | null | undefined {
  return (
    value === undefined || value === null || typeof value === 'string'
  );
}

function validateCandidate(
  candidate: unknown,
  index: number,
): PreparePrivateElectionCandidateDto {
  if (!candidate || typeof candidate !== 'object') {
    throw new BadRequestException(
      `candidateManifestPreimage.candidates[${index}] must be an object`,
    );
  }

  const candidateRecord = candidate as Record<string, unknown>;

  if (!isNonEmptyString(candidateRecord.candidateKey)) {
    throw new BadRequestException(
      `candidateManifestPreimage.candidates[${index}].candidateKey must be a non-empty string`,
    );
  }

  if (
    typeof candidateRecord.displayOrder !== 'number' ||
    !Number.isInteger(candidateRecord.displayOrder) ||
    candidateRecord.displayOrder < 1
  ) {
    throw new BadRequestException(
      `candidateManifestPreimage.candidates[${index}].displayOrder must be an integer greater than or equal to 1`,
    );
  }

  if (!isOptionalString(candidateRecord.imageUrl)) {
    throw new BadRequestException(
      `candidateManifestPreimage.candidates[${index}].imageUrl must be a string, null, or undefined`,
    );
  }

  return {
    candidateKey: candidateRecord.candidateKey,
    displayOrder: candidateRecord.displayOrder,
    imageUrl:
      candidateRecord.imageUrl === undefined ? undefined : candidateRecord.imageUrl,
  };
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

    if (
      !body.candidateManifestPreimage ||
      typeof body.candidateManifestPreimage !== 'object'
    ) {
      throw new BadRequestException(
        'candidateManifestPreimage must be an object',
      );
    }

    const manifest = body.candidateManifestPreimage as Record<string, unknown>;

    if (!Array.isArray(manifest.candidates) || manifest.candidates.length === 0) {
      throw new BadRequestException(
        'candidateManifestPreimage.candidates must be a non-empty array',
      );
    }

    return {
      seriesPreimage: body.seriesPreimage,
      seriesCoverImageUrl:
        body.seriesCoverImageUrl === undefined ? undefined : body.seriesCoverImageUrl,
      title: body.title,
      coverImageUrl: body.coverImageUrl === undefined ? undefined : body.coverImageUrl,
      candidateManifestPreimage: {
        candidates: manifest.candidates.map((candidate, index) =>
          validateCandidate(candidate, index),
        ),
      },
    };
  }
}
