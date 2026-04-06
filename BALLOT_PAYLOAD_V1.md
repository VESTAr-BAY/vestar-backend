# VESTAr Ballot Payload V1

## 목적

이 문서는 VESTAr가 사용하는 canonical ballot payload schema를 정의한다.

- `OPEN` 모드에서는 프론트가 이 schema를 내부 ballot model로 사용할 수 있지만, 실제 온체인 호출은 `candidateKeys`만 전달한다.
- `PRIVATE` 모드에서는 이 payload를 serialize한 뒤 암호화하고, 컨트랙트에는 `encryptedBallot`만 전달한다.
- 백엔드는 이 plaintext payload를 프론트에서 직접 받지 않는다.
- 백엔드는 `PRIVATE` 모드에서 온체인 ciphertext를 복호화한 뒤 이 payload를 얻는다.

## Canonical Payload

```json
{
  "schemaVersion": 1,
  "electionId": "0x...",
  "chainId": 1660990954,
  "electionAddress": "0x...",
  "voterAddress": "0x...",
  "candidateKeys": ["IU", "ParkHyoShin"],
  "nonce": "0x..."
}
```

## 필수 필드

### `schemaVersion`

- 타입: `number`
- 필수 여부: 예
- 현재 문서 기준 값: `1`

ballot schema 버전을 구분하는 필드다.

### `electionId`

- 타입: `string`
- 필수 여부: 예
- 형식: `0x` prefix를 가진 hex string

이 ballot이 어느 election에 속하는지 식별한다.

### `chainId`

- 타입: `number`
- 필수 여부: 예

대상 체인을 식별하고 cross-chain replay를 방지한다.

### `electionAddress`

- 타입: `string`
- 필수 여부: 예
- 형식: EVM address string

정확히 어느 election contract 인스턴스에 귀속되는 ballot인지 식별한다.

### `voterAddress`

- 타입: `string`
- 필수 여부: 예
- 형식: EVM address string

온체인 tx sender와 일치해야 하는 voter 주소다.

### `candidateKeys`

- 타입: `string[]`
- 필수 여부: 예

이번 ballot에서 선택한 후보 목록이다.

최소 규칙:

- 길이는 `0`보다 커야 한다.

### `nonce`

- 타입: `string`
- 필수 여부: 예
- 형식: `0x` prefix를 가진 hex string

ballot 인스턴스를 구분하기 위한 payload 식별 재료다.

## 필드 설계 메모

### 왜 `candidateKeys`는 항상 배열인가

`candidateKeys`는 단일 선택이어도 배열로 정의한다.

이렇게 해야 아래 케이스를 하나의 schema로 표현할 수 있다.

- 단일 선택 open ballot
- 다중 선택 open ballot
- 단일 선택 private ballot
- 다중 선택 private ballot

단일 선택은 길이 `1`인 배열로 표현한다.

## 모드별 매핑

## OPEN 모드

프론트 내부 모델은 `BallotPayloadV1`를 써도 되지만, 실제 컨트랙트 호출은 다음처럼 단순하다.

```json
{
  "candidateKeys": ["IU", "ParkHyoShin"]
}
```

의미:

- canonical payload는 프론트 상태에서 유지할 수 있다.
- 실제 `submitOpenVote(...)` 호출에는 `candidateKeys`만 넘긴다.

## PRIVATE 모드

canonical payload를 먼저 serialize하고, 그 결과를 암호화한다.

컨트랙트 호출은 개념적으로 다음과 같다.

```json
{
  "encryptedBallot": "0x..."
}
```

복호화 결과는 반드시 `BallotPayloadV1`로 decode되어야 한다.

현재 백엔드 구현은 아래와 같은 하이브리드 암호화 envelope를 전제로 한다.

```json
{
  "algorithm": "rsa-oaep-aes-256-gcm",
  "encryptedKey": "<base64>",
  "iv": "<base64>",
  "authTag": "<base64>",
  "ciphertext": "<base64>"
}
```

의미:

- `encryptedKey`
  - ballot payload를 암호화한 AES 대칭키를 election public key로 RSA-OAEP 암호화한 값
- `iv`
  - AES-256-GCM IV
- `authTag`
  - AES-256-GCM authentication tag
- `ciphertext`
  - canonical payload plaintext를 AES-256-GCM으로 암호화한 값

백엔드는 온체인 `encryptedBallot`이:

- 위 JSON 문자열 그대로이거나
- 그 JSON UTF-8 bytes를 `0x...` hex로 인코딩한 형태

둘 중 하나로 들어온다고 가정하고 복호화한다.

중요:

- 백엔드는 프론트에서 이 plaintext payload를 직접 입력으로 받지 않는다.
- 백엔드 입력 원본은 온체인에 포함된 `encryptedBallot`이다.
- 이 문서의 payload는 `encryptedBallot` 복호화 후 얻는 canonical schema다.

## 최소 직렬화 규칙

private ballot에서는 프론트와 백엔드가 암호화 전에 사용할 canonical serialization 방식에 합의해야 한다.

권장 요구사항:

- 필드 이름 고정
- 필드 순서 고정
- deterministic encoding 사용

이 문서는 payload 필드를 정의하지만, 최종 serialization 알고리즘 자체는 정의하지 않는다.

## 범위 밖

이 문서는 다음을 정의하지 않는다.

- 암호화 알고리즘 세부 사항
- key exchange 포맷
- 결과 summary 포맷
- ballot 제출 외의 프론트 form DTO
