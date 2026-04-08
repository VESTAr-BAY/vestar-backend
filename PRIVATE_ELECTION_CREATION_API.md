# VESTAr Private Election Creation API

## 목적

이 문서는 `PRIVATE` election 생성 시 프론트와 백엔드가 주고받는 `prepare` 메시지 형식을 정의한다.

## 핵심 전제

- 프론트는 on-chain 생성 전에 해시 원문과 UI 메타데이터를 백엔드에 먼저 보낸다.
- 백엔드는 draft 저장, candidate 저장, key pair 생성, 해시 계산을 수행한다.
- 프론트는 백엔드가 응답한 해시/공개키/commitment를 사용해 `createElection(...)`를 직접 호출한다.
- on-chain 생성 성공 후 DB 확정은 인덱서가 수행한다.

## Endpoint

```http
POST /private-elections/prepare
```

## 요청 형식

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

## 요청 필드 설명

- `seriesKey`
  - 컨트랙트 `seriesId`의 preimage
- `seriesCoverImageUrl`
  - series 배너 이미지 URL
  - DB/UI 전용 메타데이터
- `title`
  - election 제목 원문
- `coverImageUrl`
  - election 대표 배너 이미지 URL
  - DB/UI 전용 메타데이터
- `candidateManifestPreimage.candidates[].candidateKey`
  - 후보 식별 key 원문
- `candidateManifestPreimage.candidates[].displayOrder`
  - 후보 표시 순서
- `candidateManifestPreimage.candidates[].imageUrl`
  - 후보 이미지 URL
  - DB/UI 전용 메타데이터

## 해시 대상 데이터 형식

프론트가 최종적으로 컨트랙트 `candidateManifestHash`에 대응시키는 해시 원본 형식은 아래와 같다.

```json
{
  "candidates": [
    { "candidateKey": "임영웅", "displayOrder": 1 },
    { "candidateKey": "아이유", "displayOrder": 2 }
  ]
}
```

중요:

- 이 형식이 바로 온체인 `candidateManifestHash`의 canonical preimage다.
- 후보 이미지 URL은 이 해시 원본에 포함되지 않는다.
- `seriesCoverImageUrl`, `coverImageUrl`, candidate `imageUrl`은 모두 UI/DB 전용 메타데이터다.

## 백엔드 처리

백엔드는 이 요청을 받으면:

- `election_series` 생성 또는 재사용
- `series_cover_image_url` 저장 또는 갱신
- `seriesIdHash` 계산
- `titleHash` 계산
- `candidateManifestHash` 계산
- `election_drafts` 생성
- `election_candidates` 생성
- P-256 key pair 생성
- `private_key_commitment_hash` 생성
- `private_key_encrypted` 생성
- `election_keys` 생성

주의:

- 후보 이미지는 `election_candidates.image_url`에 저장된다.
- `candidateManifestHash` 계산에는 candidate `imageUrl`이 포함되지 않는다.
- 이미지 URL은 UI 메타데이터일 뿐, 온체인 무결성 해시 대상이 아니다.

강조:

- `election_drafts.candidate_manifest_preimage`에는 **바로 위 canonical preimage가 저장된다.**
- 즉 DB의 `candidate_manifest_preimage` 필드는 온체인 `candidateManifestHash` 계산에 사용된 원본 메시지를 그대로 보관하는 필드다.
- 이미지 URL은 이 필드가 아니라 `election_candidates.image_url`에만 저장된다.

## 응답 형식

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
      { "candidateKey": "임영웅", "displayOrder": 1 },
      { "candidateKey": "아이유", "displayOrder": 2 }
    ]
  }
}
```

## 응답 필드 설명

- `seriesIdHash`
  - 컨트랙트 `seriesId`
- `titleHash`
  - 컨트랙트 `titleHash`
- `candidateManifestHash`
  - 컨트랙트 `candidateManifestHash`
- `keySchemeVersion`
  - 현재 `1`
- `publicKey`
  - `P-256 ECDH` 공개키 PEM
- `privateKeyCommitmentHash`
  - 컨트랙트 `privateKeyCommitmentHash`
- `candidateManifestPreimage`
  - 해시용으로 정렬/정규화된 후보 원문
  - 현재 응답에는 `candidateKey`, `displayOrder`만 포함된다

즉 프론트는 이 응답의 `candidateManifestPreimage`를

- 온체인 hash 대상 원문
- DB `candidate_manifest_preimage`에 저장된 원문

과 동일한 canonical 데이터로 이해하면 된다.

## On-chain 이후 처리

프론트는 `prepare` 이후 organizer 지갑으로 `createElection(...)`를 보낸다.

그 이후 백엔드는 인덱서를 통해:

- `ElectionCreated` 감지
- `onchain_election_id`
- `onchain_election_address`
- `organizer_wallet_address`
- 정책/시간/결제 snapshot
- `onchain_state`

를 `onchain_elections`에 채운다.
