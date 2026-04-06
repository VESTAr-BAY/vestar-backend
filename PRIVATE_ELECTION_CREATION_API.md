# VESTAr Private Election Creation API

## 목적

이 문서는 `PRIVATE` election 생성 시 프론트와 백엔드가 주고받는 메시지 형식을 정의한다.

이 문서의 범위는 아래 두 API다.

- `POST /private-elections/prepare`

해시 규칙 상세는 [HASHING_RULES.md](/Users/jeong-yoonho/vscode/Vestar/vestar-backend/HASHING_RULES.md) 를 따른다.

핵심 전제:

- 프론트는 컨트랙트에 해시로 올릴 원문 데이터를 먼저 백엔드에 보낸다.
- 프론트는 `prepare` 단계에서 컨트랙트에 해시로 올릴 원문 데이터만 백엔드에 보낸다.
- 백엔드는 원문 저장, 후보 파싱 저장, key pair 생성까지 수행한다.
- 최신 컨트랙트는 `seriesId != 0`을 강제하므로 `groupKey`는 필수다.
- 프론트는 백엔드가 반환한 `publicKey`, `privateKeyCommitmentHash`를 사용해 컨트랙트 생성 트랜잭션을 직접 보낸다.
- 온체인 생성 성공 후에는 백엔드 인덱서가 이벤트와 컨트랙트 조회를 통해 DB row를 확정한다.

## 키 생성 방식

현재 백엔드는 `prepare` 단계에서 `PRIVATE` election용 공개키/개인키 쌍을 생성한다.

- 공개키/개인키 쌍 생성
  - Node.js `crypto.generateKeyPairSync('rsa', ...)`
  - 현재 구현은 RSA 2048 기준이다
- `privateKeyCommitmentHash`
  - 생성된 private key PEM 원문을 `keccak256` 해시한 값이다
  - 컨트랙트에는 이 commitment hash가 저장된다
- `privateKeyEncrypted`
  - DB에는 private key 평문을 저장하지 않는다
  - `PRIVATE_KEY_ENCRYPTION_SECRET` 환경변수로 AES-256-GCM 암호화를 수행한 값을 저장한다

즉 현재 구현은:

- 투표 암호화용: 공개키/개인키 쌍
- DB 저장 보호용: 대칭키 AES 암호화

구조다.

## seriesKey / electionKey 개념

- `groupKey`
  - 백엔드 API에서 받는 series 원문 key다.
  - 컨트랙트 `seriesId`의 preimage다.
- `onchainElectionId`
  - 컨트랙트 `electionId`다.
  - 실제 개별 election 식별자다.

예:

- `groupKey = "mama-17th"`
- `onchainElectionId = keccak256("mama-17th-female-solo")`

standalone election도 `seriesId != 0` 제약 때문에 `groupKey`가 필요하다.

예:

- 화면 제목: `Show Me The Money Final Stage`
- `groupKey = "show-me-the-money-final-stage"`
- `onchainElectionId = keccak256("show-me-the-money-final-stage-2026")`

즉 하나만 있는 election이라도 `groupKey`와 `electionId`는 역할이 다르다.

## 1. Prepare API

### Endpoint

```http
POST /private-elections/prepare
```

### 프론트 -> 백엔드 요청 형식

```json
{
  "groupKey": "mama-17th",
  "title": "MAMA Female Solo",
  "candidateManifestPreimage": {
    "candidates": [
      { "candidateKey": "iu", "displayOrder": 1 },
      { "candidateKey": "taeyeon", "displayOrder": 2 }
    ]
  }
}
```

### 요청 필드 설명

- `groupKey`
  - 타입: `string`
  - 상위 election series 원문 key
  - 컨트랙트 `seriesId`의 preimage
  - 최신 컨트랙트는 `seriesId != 0`을 강제하므로 필수다

- `title`
  - 타입: `string`
  - 프론트가 표시하는 election 제목 원문
  - 백엔드는 이 원문을 저장하고, 프론트는 같은 원문으로 `titleHash`를 만든다

- `candidateManifestPreimage`
  - 타입: `object`
  - 후보 원본 메시지
  - 백엔드는 이 값을 그대로 저장하고, 파싱해서 `election_candidates` row를 만든다

- `candidateManifestPreimage.candidates`
  - 타입: `array`
  - 후보 목록

- `candidateManifestPreimage.candidates[].candidateKey`
  - 타입: `string`
  - 후보 식별 key 원문

- `candidateManifestPreimage.candidates[].displayOrder`
  - 타입: `number`
  - 후보 표시 순서

### 백엔드 처리

백엔드는 이 요청을 받으면:

- `groupKey`가 있으면 `election_groups`를 upsert
- `groupKey`를 해시해 `seriesIdHash` 계산
- `elections` row 생성
- `candidate_manifest_preimage` 원문 저장
- `election_candidates` row 생성
- RSA key pair 생성
- `private_key_commitment_hash` 생성
- `private_key_encrypted` 생성
- `election_keys` row 생성
- 초기 `state = PREPARED` 저장

이 단계에서는 아직 아래 값들을 받지 않는다.

- organizer wallet
- organizer verified snapshot
- payment mode
- ballot policy
- 시작/종료/reveal 시각
- karma tier
- selection 정책
- payment token
- cost per ballot

이 값들은 이후 on-chain election 생성이 성공한 뒤 백엔드 인덱서가 채운다.

### 백엔드 -> 프론트 응답 형식

```json
{
  "electionId": "1",
  "visibilityMode": "PRIVATE",
  "state": "PREPARED",
  "seriesIdHash": "0x...",
  "titleHash": "0x...",
  "candidateManifestHash": "0x...",
  "keySchemeVersion": 1,
  "publicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n",
  "privateKeyCommitmentHash": "0x...",
  "candidateManifestPreimage": {
    "candidates": [
      { "candidateKey": "iu", "displayOrder": 1 },
      { "candidateKey": "taeyeon", "displayOrder": 2 }
    ]
  }
}
```

### 응답 필드 설명

- `electionId`
  - DB 내부 PK
  - 이후 백엔드 인덱서가 prepared row를 식별하는 내부 키로 사용 가능

- `visibilityMode`
  - 항상 `PRIVATE`

- `state`
  - 초기 상태
  - 항상 `PREPARED`

- `titleHash`
  - 프론트가 컨트랙트 생성 시 사용할 title 해시

- `seriesIdHash`
  - 프론트가 컨트랙트 생성 시 사용할 `seriesId`

- `candidateManifestHash`
  - 프론트가 컨트랙트 생성 시 사용할 후보 manifest 해시

- `keySchemeVersion`
  - 프론트가 컨트랙트 생성 config에 넣을 고정 키 스킴 버전
  - 현재 백엔드는 RSA key pair 기준으로 `1`을 내려준다

- `publicKey`
  - 프론트가 컨트랙트 생성 config에 넣을 공개키

- `privateKeyCommitmentHash`
  - 프론트가 컨트랙트 생성 config에 넣을 private key commitment hash

- `candidateManifestPreimage`
  - 백엔드가 정렬/정규화한 후보 원본 메시지
  - 프론트는 가능하면 이 값을 기준으로 해시를 만든다

## 2. On-chain Confirm은 백엔드 인덱서가 수행

온체인 생성 이후 DB 확정은 프론트 공개 API가 아니라 백엔드 인덱서/워커가 수행한다.

즉 프론트는:

- `prepare` 호출
- organizer 지갑으로 `createElection(...)` 호출

까지만 담당하고,

그 이후에는 백엔드가:

- `ElectionCreated` 이벤트 감지
- election contract address 확보
- on-chain config 조회
- `elections` row 업데이트
- `state = ACTIVE` 전환

을 수행한다.

추가로 백엔드 인덱서는:

- 마지막 처리 블록을 DB 커서로 저장
- 최근 블록 구간을 주기적으로 다시 스캔
- `PREPARED` 상태 row를 재확인

해서, 일시적인 다운타임이나 재시작 때문에 `ElectionCreated`를 한 번 놓쳐도 복구할 수 있게 동작한다.

### 인덱서가 채우는 필드

- `onchain_election_id`
- `onchain_election_address`
- `election_groups.onchain_series_id`
- `organizer_wallet_address`
- `organizer_verified_snapshot`
- `payment_mode`
- `ballot_policy`
- `start_at`
- `end_at`
- `result_reveal_at`
- `min_karma_tier`
- `reset_interval_seconds`
- `allow_multiple_choice`
- `max_selections_per_submission`
- `timezone_window_offset`
- `payment_token`
- `cost_per_ballot`
- `state`

## 3. 프론트 구현 규칙

- 프론트는 `prepare` 응답으로 받은 `publicKey`, `privateKeyCommitmentHash`를 컨트랙트 생성에 사용한다.
- 프론트는 해시 계산 시 가능하면 `prepare` 응답의 정규화된 원문 값을 기준으로 한다.
- 프론트가 컨트랙트 생성 트랜잭션을 보내지 않으면 DB에는 `PREPARED` 상태 row가 남을 수 있다.
- 이 row는 이후 만료 정책 또는 운영 정리 대상으로 본다.
- 프론트는 `confirm-onchain` 같은 별도 백엔드 확정 API를 호출하지 않는다.

## 4. 상태 전이

현재 `PRIVATE` election 생성 기준 상태 전이는 아래만 우선 사용한다.

- `PREPARED`
- `ONCHAIN_PENDING`
- `ACTIVE`
- `FINALIZED`
- `CANCELLED`
- `EXPIRED`
- `FAILED`

생성 플로우 관점의 기본 전이:

- `PREPARED -> ACTIVE`
- 생성되지 않으면 `PREPARED -> EXPIRED`
- 실패하면 `PREPARED -> FAILED`

비고:

- `ONCHAIN_PENDING` enum은 남겨두지만, 현재 구현에서는 프론트 confirm API가 없으므로 일반적으로 별도 기록하지 않는다.
- on-chain 생성이 감지되면 인덱서가 바로 `ACTIVE` 또는 이후 상태로 갱신한다.

## 5. 프론트 구현 예시

아래 예시는 프론트가 `prepare -> on-chain create` 순서로 백엔드와 컨트랙트를 엮는 방식의 예시다.

```ts
type PreparePrivateElectionRequest = {
  groupKey: string;
  title: string;
  candidateManifestPreimage: {
    candidates: Array<{
      candidateKey: string;
      displayOrder: number;
    }>;
  };
};

type PreparePrivateElectionResponse = {
  electionId: string;
  visibilityMode: 'PRIVATE';
  state: 'PREPARED';
  seriesIdHash: string;
  titleHash: string;
  candidateManifestHash: string;
  keySchemeVersion: number;
  publicKey: string;
  privateKeyCommitmentHash: string;
  candidateManifestPreimage: {
    candidates: Array<{
      candidateKey: string;
      displayOrder: number;
    }>;
  };
};

async function createPrivateElectionFlow() {
  const preparePayload: PreparePrivateElectionRequest = {
    groupKey: 'mama-17th',
    title: 'MAMA Female Solo',
    candidateManifestPreimage: {
      candidates: [
        { candidateKey: 'iu', displayOrder: 1 },
        { candidateKey: 'taeyeon', displayOrder: 2 },
      ],
    },
  };

  const prepareRes = await fetch('/private-elections/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(preparePayload),
  });

  const prepared =
    (await prepareRes.json()) as PreparePrivateElectionResponse;

  const txConfig = {
    electionId: '0x...',
    seriesId: prepared.seriesIdHash,
    visibilityMode: 'PRIVATE',
    titleHash: prepared.titleHash,
    candidateManifestHash: prepared.candidateManifestHash,
    candidateManifestURI: '',
    startAt: 1760000000,
    endAt: 1760864000,
    resultRevealAt: 1760867600,
    minKarmaTier: 0,
    ballotPolicy: 'ONE_PER_ELECTION',
    resetInterval: 86400,
    paymentMode: 'FREE',
    costPerBallot: 0n,
    allowMultipleChoice: false,
    maxSelectionsPerSubmission: 1,
    timezoneWindowOffset: 32400,
    paymentToken: '0x0000000000000000000000000000000000000000',
    electionPublicKey: prepared.publicKey,
    privateKeyCommitmentHash: prepared.privateKeyCommitmentHash,
    keySchemeVersion: prepared.keySchemeVersion,
  };

  // organizer 지갑으로 createElection(...) 직접 호출
  const txHash = await writeCreateElection(txConfig);

  // tx 성공 이후 on-chain election 확정은 백엔드 인덱서가 처리
  await waitForTransactionReceipt(txHash);
}
```

위 예시의 핵심은 이렇다.

- `prepare`에는 해시 원문만 보낸다.
- 컨트랙트 생성은 프론트가 organizer 지갑으로 직접 수행한다.
- on-chain 생성 이후 DB 확정은 백엔드 인덱서가 수행한다.
