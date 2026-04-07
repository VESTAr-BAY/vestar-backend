# VESTAr Backend Environment Variables

이 문서는 현재 `vestar-backend`가 사용하는 환경변수를 한 곳에 정리한다.

기준 파일:

- [.env.example](/Users/jeong-yoonho/vscode/Vestar/vestar-backend/.env.example)

## 필수 환경변수

### `DATABASE_URL`

- PostgreSQL 연결 문자열
- 예:

```env
DATABASE_URL="postgresql://your_db_user:your_db_password@localhost:5432/your_db_name?schema=public"
```

역할:

- Prisma와 Nest 백엔드가 사용하는 기본 DB 연결

### `PRIVATE_KEY_ENCRYPTION_SECRET`

- private election 생성 시 만들어진 private key를 DB에 저장하기 전에 암호화하는 비밀값

현재 사용 방식:

- 백엔드는 P-256 공개키/개인키 쌍을 생성한다
- private key PEM은 평문으로 저장하지 않는다
- 이 환경변수를 바탕으로 AES-256-GCM 키를 파생해 `private_key_encrypted`로 저장한다

주의:

- 운영 환경에서는 충분히 긴 랜덤 문자열을 사용해야 한다
- 유출되면 DB에 저장된 private key 암호문 복호화 위험이 생긴다

## 일반 앱 환경변수

### `APP_PORT`

- NestJS 서버 포트
- 예:

```env
APP_PORT=3000
```

## 인덱서 환경변수

### `INDEXER_RPC_URL`

- 인덱서가 연결할 RPC endpoint
- 예:

```env
INDEXER_RPC_URL="https://your-rpc.example.com"
```

역할:

- `ElectionCreated` 이벤트 polling
- `EncryptedVoteSubmitted` 이벤트 polling
- election contract `view` 호출
- submission tx / block 조회

### `INDEXER_FACTORY_ADDRESS`

- `VESTArElectionFactory` 컨트랙트 주소

역할:

- `ElectionCreated` 이벤트를 읽는 기준 factory 주소

### `INDEXER_START_BLOCK`

- 인덱서가 처음 시작할 때 읽기 시작할 기본 블록 번호
- 이미 저장된 인덱서 커서가 있으면 그 값이 우선한다
- 로컬 개발에서는 현재 테스트를 시작한 최근 블록으로 올려두는 편이 좋다

역할:

- 첫 실행 시 초기 fromBlock 기준값

예시:

```env
INDEXER_START_BLOCK="18825000"
```

### `INDEXER_POLL_INTERVAL_MS`

- 인덱서 polling 주기 밀리초

역할:

- factory 이벤트를 몇 ms 간격으로 확인할지 결정

### `INDEXER_RECONCILE_LOOKBACK_BLOCKS`

- 재동기화 시 최근 몇 블록을 다시 스캔할지 정하는 값

역할:

- `PREPARED` 상태 election이 남아 있을 때 최근 블록 구간을 재조회
- 일시적 다운타임이나 재시작으로 놓친 `ElectionCreated` / `EncryptedVoteSubmitted` 이벤트 복구 보조

## 요약

- `DATABASE_URL`
  - PostgreSQL 연결
- `PRIVATE_KEY_ENCRYPTION_SECRET`
  - DB 저장용 private key AES 암호화
- `APP_PORT`
  - Nest 서버 포트
- `INDEXER_RPC_URL`
  - 체인 조회용 RPC
- `INDEXER_FACTORY_ADDRESS`
  - factory 이벤트 인덱싱 대상 주소
- `INDEXER_START_BLOCK`
  - 첫 시작 블록
- `INDEXER_POLL_INTERVAL_MS`
  - 인덱서 polling 주기
- `INDEXER_RECONCILE_LOOKBACK_BLOCKS`
  - 최근 블록 재스캔 범위
