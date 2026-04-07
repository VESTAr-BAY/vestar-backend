# VESTAr Hashing Rules

## 목적

이 문서는 컨트랙트에 올리는 해시값이 어떤 원문으로 계산되는지 정의한다.

현재 백엔드 구현 기준:

- 해시 함수: `keccak256`
- 구현 라이브러리: `viem`
- 문자열: `keccak256(toHex(value))`
- JSON: `keccak256(toHex(JSON.stringify(value)))`

기준 코드:

- [private-elections.service.ts](/Users/jeong-yoonho/vscode/Vestar/vestar-backend/src/modules/private-elections/private-elections.service.ts)

## 1. `seriesKey -> seriesId`

```ts
seriesId = keccak256(toHex(seriesKey))
```

- 입력 원문: `seriesKey`
- 이미지 URL은 포함되지 않는다.

## 2. `title -> titleHash`

```ts
titleHash = keccak256(toHex(title))
```

- 입력 원문: `title`
- election 대표 이미지 URL은 포함되지 않는다.

## 3. `candidateManifestPreimage -> candidateManifestHash`

### 해시 입력 원문

현재 해시 대상 manifest는 아래 필드만 사용한다.

```json
{
  "candidates": [
    { "candidateKey": "임영웅", "displayOrder": 1 },
    { "candidateKey": "아이유", "displayOrder": 2 }
  ]
}
```

### 해시 제외 필드

다음 필드는 DB/UI용 메타데이터이며 해시에 포함하지 않는다.

- `candidateManifestPreimage.candidates[].imageUrl`
- `seriesCoverImageUrl`
- `coverImageUrl`

### 정규화 규칙

- `candidates` 배열을 `displayOrder` 오름차순으로 정렬
- 각 candidate에서 해시 대상으로 사용하는 필드는:
  - `candidateKey`
  - `displayOrder`

### 해시 규칙

```ts
candidateManifestHash = keccak256(
  toHex(JSON.stringify(normalizedManifest)),
)
```

## 4. `privateKey -> privateKeyCommitmentHash`

```ts
privateKeyCommitmentHash = keccak256(toHex(privateKeyPem))
```

- 입력 원문: private key PEM
- 컨트랙트에는 private key 평문이 아니라 commitment hash만 저장한다.

## 5. Canonicalization 주의사항

같은 해시를 얻으려면 아래가 반드시 같아야 한다.

- 문자열 원문
- 대소문자
- 공백
- JSON 구조
- candidate 배열 정렬 순서

특히 `candidateManifestHash`는:

- 이미지 URL을 포함한 raw 후보 메타를 그대로 해시하면 안 된다.
- 백엔드가 정렬/정규화한 `candidateKey + displayOrder` manifest를 기준으로 계산해야 한다.

## 6. 프론트 구현 규칙

프론트는 가능하면:

1. `POST /private-elections/prepare` 호출
2. 응답으로 받은
   - `seriesIdHash`
   - `titleHash`
   - `candidateManifestHash`
   - `candidateManifestPreimage`
   를 그대로 사용

즉 실제 컨트랙트 호출에는 프론트 재계산보다 백엔드 응답값을 우선 사용한다.
