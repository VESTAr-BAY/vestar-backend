# VESTAr Hashing Rules

## 목적

이 문서는 VESTAr에서 컨트랙트에 올리는 해시값이 어떤 원문과 어떤 규칙으로 계산되는지 정의한다.

목표:

- 프론트가 백엔드와 동일한 해시를 계산할 수 있어야 한다
- 제3자가 원문과 온체인 해시를 대조 검증할 수 있어야 한다
- 백엔드 문서/API/컨트랙트 입력이 같은 canonical rule을 따라야 한다

현재 백엔드 구현 기준:

- 해시 함수: `keccak256`
- 구현 라이브러리: `viem`
- 사용 패턴:
  - 문자열: `keccak256(toHex(value))`
  - JSON: `keccak256(toHex(JSON.stringify(value)))`

기준 코드:

- [private-elections.service.ts](/Users/jeong-yoonho/vscode/Vestar/vestar-backend/src/modules/private-elections/private-elections.service.ts)

## 1. `groupKey -> seriesId`

### 입력 원문

- `groupKey`
- 타입: `string`

예:

```text
mama-17th
```

### 해시 규칙

```ts
seriesId = keccak256(toHex(groupKey))
```

### 의미

- DB의 `election_groups.group_key`는 사람이 읽는 원문
- 컨트랙트의 `seriesId`는 이 원문의 해시값

## 2. `title -> titleHash`

### 입력 원문

- `title`
- 타입: `string`

예:

```text
MAMA Female Solo
```

### 해시 규칙

```ts
titleHash = keccak256(toHex(title))
```

### 의미

- DB의 `elections.title`은 사람이 읽는 원문
- 컨트랙트의 `titleHash`는 이 원문의 해시값

## 3. `candidateManifestPreimage -> candidateManifestHash`

### 입력 원문

- `candidateManifestPreimage`
- 타입: JSON object

예:

```json
{
  "candidates": [
    { "candidateKey": "iu", "displayOrder": 1 },
    { "candidateKey": "taeyeon", "displayOrder": 2 }
  ]
}
```

### 정규화 규칙

후보 manifest는 해시 전에 반드시 정규화한다.

현재 백엔드 구현 기준:

- `candidates` 배열을 `displayOrder` 오름차순으로 정렬
- 각 candidate에서 사용하는 필드는 현재:
  - `candidateKey`
  - `displayOrder`

즉 해시 기준 원문은 프론트가 보낸 raw object가 아니라,
**백엔드가 정렬/정규화한 canonical manifest**다.

### 해시 규칙

```ts
candidateManifestHash = keccak256(
  toHex(JSON.stringify(normalizedManifest)),
)
```

## 4. `privateKey -> privateKeyCommitmentHash`

### 입력 원문

- private key PEM string

### 해시 규칙

```ts
privateKeyCommitmentHash = keccak256(toHex(privateKeyPem))
```

### 의미

- 컨트랙트에는 private key 평문이 아니라 commitment hash만 저장
- 나중에 key reveal 시 공개된 private key가 원래 키인지 검증하는 기준

## 5. Canonicalization 주의사항

같은 해시를 얻으려면 아래가 반드시 같아야 한다.

- 문자열 원문 자체
- 대소문자
- 공백
- 줄바꿈
- JSON 필드 구조
- candidate 배열 정렬 순서

특히 `candidateManifestPreimage`는:

- 프론트가 보낸 순서 그대로 해시하면 안 되고
- 백엔드가 응답으로 돌려준 정규화된 manifest를 기준으로 해시하는 것이 안전하다

## 6. 프론트 구현 규칙

프론트는 가능하면:

1. `POST /private-elections/prepare` 호출
2. 응답으로 받은
   - `seriesIdHash`
   - `titleHash`
   - `candidateManifestHash`
   - `candidateManifestPreimage`
   를 기준으로 컨트랙트 생성값을 만든다

즉 프론트가 직접 같은 규칙으로 재계산할 수도 있지만,
실제 컨트랙트 호출에는 백엔드가 돌려준 정규화 결과와 해시값을 그대로 쓰는 것이 가장 안전하다.

## 7. 예시

입력:

```json
{
  "groupKey": "mama-17th",
  "title": "MAMA Female Solo",
  "candidateManifestPreimage": {
    "candidates": [
      { "candidateKey": "taeyeon", "displayOrder": 2 },
      { "candidateKey": "iu", "displayOrder": 1 }
    ]
  }
}
```

정규화 후:

```json
{
  "candidates": [
    { "candidateKey": "iu", "displayOrder": 1 },
    { "candidateKey": "taeyeon", "displayOrder": 2 }
  ]
}
```

계산 대상:

- `seriesId = keccak256(toHex("mama-17th"))`
- `titleHash = keccak256(toHex("MAMA Female Solo"))`
- `candidateManifestHash = keccak256(toHex(JSON.stringify(normalizedManifest)))`

## 8. 범위 밖

이 문서는 다음을 정의하지 않는다.

- ballot 암호화 알고리즘
- RSA/AES envelope 직렬화 세부 규칙
- tally 계산 규칙
- result summary 포맷
