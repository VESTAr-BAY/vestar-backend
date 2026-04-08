export class PreparePrivateElectionCandidateDto {
  candidateKey!: string;
  displayOrder!: number;
  imageUrl?: string | null;
}

export class PreparePrivateElectionCandidateManifestDto {
  candidates!: PreparePrivateElectionCandidateDto[];
}

export class PreparePrivateElectionDto {
  seriesPreimage!: string;
  seriesCoverImageUrl?: string | null;
  title!: string;
  coverImageUrl?: string | null;
  candidateManifestPreimage!: PreparePrivateElectionCandidateManifestDto;
}
