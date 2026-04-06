# VESTAr Ballot 검증 규칙

## 목적

이 문서는 private tally 전에 적용해야 하는 ballot 검증 규칙을 정의한다.

- `OPEN` election은 제출 시점에 컨트랙트가 온체인에서 검증한다.
- `OPEN` tally는 프론트가 컨트랙트에서 직접 조회한다.
- `PRIVATE` election은 복호화 이후 백엔드가 오프체인에서 검증하고 집계한다.

목표는 `PRIVATE` 모드가 `OPEN` 모드에서 컨트랙트가 강제하는 후보 유효성 규칙과 동일한 기준으로 tally되도록 만드는 것이다.

## 범위

이 문서가 다루는 내용:

- private ballot 복호화 후 기준이 되는 canonical payload 형태
- private tally 전에 반드시 통과해야 하는 검증 규칙
- `OPEN` 온체인 검증 규칙과 `PRIVATE` 오프체인 검증 규칙의 대응 관계

이 문서가 다루지 않는 내용:

- 암호화 알고리즘 세부 사항
- 결과 패키지 포맷
- UI 전용 요청 DTO

## Canonical Ballot Payload

백엔드는 private ballot을 복호화한 뒤 아래 구조를 canonical ballot payload로 간주해야 한다.

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

- `schemaVersion`
- `electionId`
- `chainId`
- `electionAddress`
- `voterAddress`
- `candidateKeys`
- `nonce`

## 검증 단계

검증은 private tally 전에 수행되어야 한다.

1. ballot payload를 decode 또는 decrypt 한다.
2. payload schema가 맞는지 검증한다.
3. 이 ballot이 현재 election context에 속하는지 검증한다.
4. 후보 선택 규칙을 검증한다.
5. 유효하면 tally에 반영한다.
6. 유효하지 않으면 tally에서 제외하고 invalid ballot로 분류한다.

## 검증 규칙

아래 규칙은 private ballot 복호화 후 적용해야 하는 검증 규칙이다.
이 규칙은 가능한 한 `OPEN` 모드에서 컨트랙트가 강제하는 규칙과 동일해야 한다.

### 1. Schema 규칙

- `schemaVersion`은 백엔드 verifier가 지원하는 버전이어야 한다.
- 지원하지 않는 버전은 invalid ballot로 처리한다.

### 2. Election 귀속 규칙

- `electionId`는 대상 election과 일치해야 한다.
- `electionAddress`는 투표를 받은 election contract 주소와 일치해야 한다.

이 규칙은 다른 election 또는 다른 chain으로의 replay를 막기 위한 것이다.

주의:

- payload에는 `chainId`를 포함하지만, 현재 백엔드 구현은 별도 chainId 대조까지는 수행하지 않는다.
- 현재 실제 검증은 `electionId`, `electionAddress`, `voterAddress`, 후보/정책 규칙 기준으로 이뤄진다.

### 3. Voter 귀속 규칙

- ballot payload 안의 `voterAddress`는 온체인에 기록된 tx sender와 일치해야 한다.

복호화된 payload의 voter와 실제 제출자가 다르면 invalid ballot이다.

### 4. 후보 목록 존재 규칙

- `candidateKeys`는 존재해야 한다.
- `candidateKeys.length`는 `0`보다 커야 한다.

빈 선택은 invalid ballot이다.

### 5. 단일 선택 / 다중 선택 규칙

- `allowMultipleChoice == false` 이면 `candidateKeys.length`는 정확히 `1`이어야 한다.
- `allowMultipleChoice == true` 이면 `candidateKeys.length`는 `maxSelectionsPerSubmission` 이하여야 한다.

### 6. Unlimited Paid 규칙

- `ballotPolicy == UNLIMITED_PAID` 이면 `candidateKeys.length`는 정확히 `1`이어야 한다.

이 규칙은 현재 election contract의 정책과 동일해야 한다.

### 7. 중복 후보 규칙

- `candidateKeys` 안에 중복 후보가 있으면 안 된다.

예:

```json
["IU", "IU"]
```

이 경우 invalid ballot이다.

### 8. 후보 allowlist 규칙

- `candidateKeys`의 모든 후보는 election의 candidate allowlist 또는 canonical candidate manifest에 존재해야 한다.

알 수 없는 후보나 비활성 후보가 하나라도 있으면 invalid ballot이다.

### 9. Ballot 제출 가능 규칙

- 해당 voter는 election 정책상 ballot을 제출할 수 있는 상태였어야 한다.
- 해당 vote는 성공한 온체인 submission에 대응되어야 한다.

`PRIVATE`에서는 제출 시점에 timing, eligibility, ballot availability를 통과한 성공 tx만 tally 대상으로 삼아야 한다.

구체적으로 백엔드는 복호화 이후에도 아래 사용량 규칙을 다시 검사한다.

- `ballotPolicy == ONE_PER_ELECTION`
  - 컨트랙트의 `_currentPeriodKey(...) == 0` 의미로 period를 하나로 본다
  - 같은 election에서 같은 voter의 현재 period 제출 수가 0이 아니면 invalid
- `ballotPolicy == ONE_PER_INTERVAL`
  - `block_timestamp`, `reset_interval_seconds`, `timezone_window_offset`로 컨트랙트와 같은 period key를 계산
  - 같은 voter의 같은 period 유효 ballot 수를 세어 `_remainingBallotsForPeriod(...)` 의미로 남은 투표권을 계산
  - 남은 투표권이 0이면 invalid
- `ballotPolicy == UNLIMITED_PAID`
  - 컨트랙트의 `_isUnlimitedVoting()` 의미로 period 내 제출 수 제한을 두지 않는다
  - 반복 제출은 허용하되 현재 정책상 단일 선택 규칙은 유지

### 10. Nonce 존재 규칙

- `nonce`는 존재해야 하며 비어 있으면 안 된다.

v1에서는 duplicate nonce를 반드시 차단하지 않더라도, payload 식별 재료로서 nonce를 필수로 둔다.

## 모드별 적용 방식

## OPEN 모드

`OPEN` 모드에서는:

- 컨트랙트가 `string[] candidateKeys`를 직접 받는다.
- 컨트랙트가 후보 선택 규칙을 온체인에서 검증한다.
- 컨트랙트가 즉시 tally를 갱신한다.

따라서 제출 시점 유효성과 실시간 tally의 권위는 컨트랙트에 있다.
백엔드는 `OPEN` tally를 별도로 계산하지 않는다.

## PRIVATE 모드

`PRIVATE` 모드에서는:

- 컨트랙트는 `bytes encryptedBallot`만 받는다.
- 컨트랙트는 후보 내용을 직접 검사하지 않는다.
- 백엔드가 ballot payload를 복호화한다.
- 백엔드가 이 문서의 공통 검증 규칙을 적용한다.
- 검증을 통과한 복호화 ballot만 tally에 반영한다.

즉 `PRIVATE` 모드는 `OPEN` 모드가 온체인에서 강제하는 후보 유효성 규칙을 복호화 후 오프체인에서 재현해야 한다.

## 백엔드 실무 규칙

private tally에서 백엔드는 아래 기준으로 판단한다.

- 복호화 실패: invalid ballot
- payload schema 불일치: invalid ballot
- election 귀속 검증 실패: invalid ballot
- voter 귀속 검증 실패: invalid ballot
- 후보 검증 실패: invalid ballot
- ballot usage 규칙 위반: invalid ballot
- 그 외 모든 검증 통과: valid ballot로 tally 반영

## Invalid Ballot 처리

invalid ballot은 다음을 만족해야 한다.

- 최종 tally에는 포함하지 않는다.
- 결과 요약에서 invalid ballot 수를 추적한다면 그 카운트에는 반영한다.
- canonical chain record를 바꾸지 않은 채 audit 가능한 진단 메타데이터는 남긴다.

권장 진단 카테고리:

- `DECRYPTION_FAILED`
- `UNSUPPORTED_SCHEMA_VERSION`
- `ELECTION_ID_MISMATCH`
- `ELECTION_ADDRESS_MISMATCH`
- `VOTER_ADDRESS_MISMATCH`
- `EMPTY_SELECTION`
- `TOO_MANY_SELECTIONS`
- `DUPLICATE_SELECTION`
- `UNKNOWN_CANDIDATE`
- `BALLOT_POLICY_VIOLATION`

## 핵심 설계 원칙

핵심 원칙은 하나다.

- `OPEN` 모드는 count 전에 온체인에서 검증한다.
- `PRIVATE` 모드는 count 전에 복호화 후 오프체인에서 검증한다.

전송 방식은 달라도 ballot 유효성 정책은 동일해야 한다.
