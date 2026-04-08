# VESTAr Backend

VESTAr 백엔드는 `PRIVATE` election의 생성 준비, on-chain 인덱싱, ballot 복호화/검증, tally projection을 담당한다.

## 책임 범위

- 프론트는 `createElection(...)`, `submitEncryptedVote(...)`를 컨트랙트로 직접 전송한다.
- 백엔드는 `prepare` 단계에서 draft 저장, key pair 생성, 해시 계산을 수행한다.
- 백엔드는 on-chain `ElectionCreated`, `EncryptedVoteSubmitted`를 polling 인덱싱한다.
- 백엔드는 private ballot만 복호화하고 검증한다.
- `live_tally`, `finalized_tally`, `result_summaries`는 DB projection이다.

## 현재 데이터 모델

- `election_series`
  - 상위 시리즈 단위
  - `series_key`, `onchain_series_id`, `cover_image_url`
- `election_drafts`
  - 오프체인 준비 단위
  - `title`, `cover_image_url`, `candidate_manifest_preimage`, `sync_state`
- `election_keys`
  - draft별 공개키 / private key commitment / encrypted private key
- `election_candidates`
  - draft별 후보 목록
  - `candidate_key`, `image_url`, `display_order`
- `onchain_elections`
  - 실제 컨트랙트 단위
  - `onchain_election_id`, `onchain_election_address`, `onchain_state`
- `vote_submissions`
- `decrypted_ballots`
- `invalid_ballots`
- `live_tally`
- `finalized_tally`
- `result_summaries`
- `indexer_cursors`

핵심 관계:

- `election_series` 1:N `election_drafts`
- `election_drafts` 1:1 `election_keys`
- `election_drafts` 1:N `election_candidates`
- `election_drafts` 1:0..1 `onchain_elections`
- `onchain_elections` 1:N `vote_submissions`

## 현재 흐름

### 1. Private election 생성

1. 프론트가 `POST /private-elections/prepare` 호출
2. 백엔드가 `election_series`, `election_draft`, `election_candidates`, `election_keys` 저장
3. 백엔드가 `seriesIdHash`, `titleHash`, `candidateManifestHash`, `publicKey`, `privateKeyCommitmentHash` 응답
4. 프론트가 organizer 지갑으로 `createElection(...)` 직접 호출
5. 백엔드 인덱서가 `ElectionCreated`를 읽고 `onchain_elections`를 확정

### 2. Private vote 처리

1. 유저가 `submitEncryptedVote(...)`를 컨트랙트로 직접 전송
2. 백엔드 인덱서가 `EncryptedVoteSubmitted` 이벤트를 읽음
3. `vote_submissions` 저장
4. 백엔드가 `election_keys.private_key_encrypted`를 `PRIVATE_KEY_ENCRYPTION_SECRET`로 복호화
5. 복호화한 private key로 `ECDH-P256 + AES-256-GCM` ballot envelope 복호화
6. payload 검증 후 `decrypted_ballots` / `invalid_ballots` 저장
7. `live_tally` 재계산
8. on-chain election이 최종 상태가 되면 `finalized_tally`, `result_summaries` 계산

## Prepare API

### `POST /private-elections/prepare`

요청 예시:

```json
{
  "seriesKey": "SHOW ME THE MONEY 12",
  "seriesCoverImageUrl": "http://localhost:3000/uploads/candidate-images/smtm12-banner.jpg",
  "title": "SMTM12 FINAL STAGE",
  "coverImageUrl": "http://localhost:3000/uploads/candidate-images/smtm12-final-stage.jpg",
  "candidateManifestPreimage": {
    "candidates": [
      {
        "candidateKey": "임영웅",
        "displayOrder": 1,
        "imageUrl": "http://localhost:3000/uploads/candidate-images/candidate-1.jpg"
      },
      {
        "candidateKey": "아이유",
        "displayOrder": 2,
        "imageUrl": "http://localhost:3000/uploads/candidate-images/candidate-2.jpg"
      }
    ]
  }
}
```

응답 예시:

```json
{
  "seriesIdHash": "0x...",
  "titleHash": "0x...",
  "candidateManifestHash": "0x...",
  "keySchemeVersion": 1,
  "publicKey": {
    "format": "pem",
    "algorithm": "ECDH-P256",
    "value": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"
  },
  "privateKeyCommitmentHash": "0x...",
  "candidateManifestPreimage": {
    "candidates": [
      {
        "candidateKey": "임영웅",
        "displayOrder": 1
      },
      {
        "candidateKey": "아이유",
        "displayOrder": 2
      }
    ]
  }
}
```

주의:

- `seriesCoverImageUrl`, `coverImageUrl`, candidate `imageUrl`은 DB/UI용 메타데이터다.
- `candidateManifestHash` 계산에는 candidate `imageUrl`이 포함되지 않는다.
- on-chain 생성 확인은 별도 confirm API가 아니라 인덱서가 수행한다.

## 인덱서

현재 인덱서는 polling 기반이다.

- factory의 `ElectionCreated` 이벤트 polling
- known election addresses의 `EncryptedVoteSubmitted` 이벤트 polling
- 기존 `onchain_elections.onchain_state` 주기 갱신
- 마지막 처리 블록은 `indexer_cursors`에 저장

## 환경변수

핵심 환경변수:

- `DATABASE_URL`
- `PRIVATE_KEY_ENCRYPTION_SECRET`
- `APP_PORT`
- `INDEXER_RPC_URL`
- `INDEXER_FACTORY_ADDRESS`
- `INDEXER_START_BLOCK`
- `INDEXER_POLL_INTERVAL_MS`
- `INDEXER_RECONCILE_LOOKBACK_BLOCKS`

자세한 설명은 [ENVIRONMENT_VARIABLES.md](/Users/jeong-yoonho/vscode/Vestar/vestar-backend/ENVIRONMENT_VARIABLES.md) 참고.

## 실행

```bash
cp .env.example .env
docker compose up -d
npx prisma generate
npx prisma db push
npm run start:dev
```

## 관련 문서

- [DB_SCHEMA.md](/Users/jeong-yoonho/vscode/Vestar/vestar-backend/DB_SCHEMA.md)
- [PRIVATE_ELECTION_CREATION_API.md](/Users/jeong-yoonho/vscode/Vestar/vestar-backend/PRIVATE_ELECTION_CREATION_API.md)
- [HASHING_RULES.md](/Users/jeong-yoonho/vscode/Vestar/vestar-backend/HASHING_RULES.md)
- [BALLOT_PAYLOAD_V1.md](/Users/jeong-yoonho/vscode/Vestar/vestar-backend/BALLOT_PAYLOAD_V1.md)
- [BALLOT_VALIDATION_RULES.md](/Users/jeong-yoonho/vscode/Vestar/vestar-backend/BALLOT_VALIDATION_RULES.md)
