# VESTAr Backend DB Schema

## 목적

이 문서는 VESTAr 백엔드가 운영해야 하는 DB 테이블 초안을 정리한다.

이 스키마는 다음 전제를 따른다.

- `OPEN` election 집계는 프론트가 컨트랙트에서 직접 조회한다.
- 백엔드는 `PRIVATE` election 집계만 담당한다.
- 투표 행위 자체에는 백엔드가 끼지 않는다.
- 프론트는 투표를 컨트랙트로 직접 전송한다.
- 백엔드는 체인에 실제 포함된 private submission만 추적한다.
- election 생성 시 프론트는 컨트랙트에 해시로 올릴 원문 데이터를 백엔드에 먼저 전달한다.
- 여기에는 `title`, `group_key`, 후보 원본 메시지 등 해시 대상 원문이 포함된다.
- 백엔드는 이 원문들을 저장하고, 후보 원본 메시지를 파싱한 후보 목록을 `election_candidates`로 나눠 저장한다.
- 후보 그룹이 아니라, 여러 election을 묶는 상위 테마 개념으로 `group`을 사용한다.
- 최신 컨트랙트는 `seriesId != 0`을 강제하므로, 모든 private election은 하나의 `group`에 속한다.
- 예: `MAMA 17th`라는 group 아래에 `female-solo`, `male-solo` election이 각각 존재할 수 있다.
- 단일 종목 election도 자체 `group_key`를 가져야 한다.

## 핵심 원칙

### 1. 한 election은 한 종목이다

- `female-solo` 투표 1개 = election 1개
- `male-solo` 투표 1개 = election 1개

### 2. group은 election 상위 묶음이다

- `group`은 후보 분류용이 아니다.
- `group`은 여러 election을 묶는 상위 이벤트/테마다.
- 예: `MAMA 17th`, `Golden Disc 2026`
- 현재 컨트랙트의 `seriesId`와 같은 개념으로 사용한다.
- 즉 DB의 `group_key`는 컨트랙트 `seriesId`의 preimage다.

### 2-1. seriesKey / electionKey 예시

- `seriesKey`
  - 같은 행사나 시리즈에 속한 election들을 묶는 key
  - 예: `mama-17th`
- `electionKey`
  - 실제 개별 election 식별자
  - 예: `mama-17th-female-solo`

예:

- `seriesKey = "mama-17th"`
- `electionKey = "mama-17th-female-solo"`
- `electionKey = "mama-17th-male-solo"`

standalone election도 `seriesId != 0` 제약 때문에 series를 가져야 한다.

예:

- 화면 이름: `Show Me The Money Final Stage`
- `seriesKey = "show-me-the-money-final-stage"`
- `electionKey = "show-me-the-money-final-stage-2026"`

즉 standalone election에서는 공용 series가 아니라, 그 election 전용 series를 둔다고 보면 된다.

### 3. private tally는 projection으로 관리한다

- 원본 submission은 `vote_submissions`
- 복호화 결과는 `decrypted_ballots`
- 검증 실패 사유는 `invalid_ballots`
- 실시간 집계 결과는 `live_tally`
- 최종 공식 집계는 `finalized_tally`

## 테이블 목록

- `admin_users`
- `verified_organizers`
- `election_groups`
- `elections`
- `election_keys`
- `election_candidates`
- `vote_submissions`
- `decrypted_ballots`
- `invalid_ballots`
- `live_tally`
- `finalized_tally`
- `result_summaries`
- `indexer_cursors`

## 1. admin_users

백오피스 관리자 계정 테이블이다.

예상 컬럼:

- `id`
- `email`
- `password_hash`
- `role`
- `created_at`
- `updated_at`

역할:

- organizer 인증 심사
- 내부 운영자 계정 관리

## 2. verified_organizers

verified 신청을 한 organizer wallet을 저장하는 테이블이다.

예상 컬럼:

- `id`
- `wallet_address`
- `status`
- `rejection_reason`
- `verified_by`
- `verified_at`
- `created_at`
- `updated_at`

역할:

- verified 신청 organizer 관리
- 심사 상태 관리
- 승인/반려 결과 관리

주의:

- 이 테이블은 모든 organizer를 저장하지 않는다.
- verified를 신청한 organizer wallet만 저장한다.

## 3. election_groups

여러 election을 묶는 상위 이벤트/테마 테이블이다.

예상 컬럼:

- `id`
- `group_key`
- `onchain_series_id`
- `created_at`
- `updated_at`

역할:

- 같은 행사나 시리즈에 속한 election들을 묶는다
- 컨트랙트 `seriesId`와 DB의 사람이 읽는 `group_key`를 연결한다

예시:

- `mama-17th`
- `golden-disc-2026`

주의:

- 이 `group`은 후보 그룹이 아니다.
- election 상위 묶음이다.

## 3-1. indexer_cursors

인덱서가 마지막으로 처리한 블록 커서를 저장하는 테이블이다.

예상 컬럼:

- `key`
- `block_number`
- `updated_at`

역할:

- 백엔드 재시작 후 마지막 처리 블록부터 인덱싱 재개
- 메모리 상태만으로 인덱서 커서를 관리하지 않도록 보조

## 4. elections

election 메타데이터와 organizer snapshot을 저장하는 테이블이다.

예상 컬럼:

- `id`
- `group_id`
- `onchain_election_id`
- `onchain_election_address`
- `title`
- `candidate_manifest_preimage`
- `organizer_wallet_address`
- `organizer_verified_snapshot`
- `visibility_mode`
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
- `created_at`
- `updated_at`

역할:

- election 기본 메타데이터 조회
- 사람이 읽는 election 제목 저장
- 후보 원본 메시지 저장
- organizer wallet과 election 연결
- election 생성 당시 verified snapshot 보관
- 필요시 상위 `group`과 연결
- 컨트랙트 생성 후 `group`의 `onchain_series_id`와 연결

주의:

- 최신 private election 컨트랙트는 `seriesId != 0`을 강제하므로 `group_id`는 필수다.
- `organizer_verified_snapshot`은 생성 당시 값이며 이후 organizer 상태가 바뀌어도 변경하지 않는다.
- `candidate_manifest_preimage`는 프론트가 생성 시 백엔드에 전달한 후보 원본 메시지다.
- `election_candidates`는 이 메시지를 파싱한 결과 row들이다.
- `PRIVATE` election 생성 플로우에서는 `prepare` 단계에서 해시 원문만 먼저 저장하므로, organizer/policy/time/payment 관련 on-chain 필드들은 생성 직후 `NULL`일 수 있다.
- 이 값들은 on-chain 생성 성공 후 백엔드 인덱서가 이벤트와 컨트랙트 조회를 통해 채운다.
- 백엔드 인덱서는 `indexer_cursors` 커서를 저장하면서 polling한다.
- 인덱서는 최근 블록 구간을 주기적으로 다시 스캔해 `PREPARED` row를 재매핑한다.

`state`는 현재 VESTAr 백엔드가 `PRIVATE` election만 다룬다는 전제에서 아래 enum으로 운영한다.

- `PREPARED`
- `ONCHAIN_PENDING`
- `ACTIVE`
- `FINALIZED`
- `CANCELLED`
- `EXPIRED`
- `FAILED`

의미:

- `PREPARED`: 백엔드 원문 저장 및 key 생성 완료, 아직 on-chain 생성 전
- `ONCHAIN_PENDING`: 예약 상태. 현재 구현에서는 일반적으로 명시적으로 쓰지 않고, 미확정 중간 상태 확장용으로 남겨둔다.
- `ACTIVE`: 투표 진행 중
- `FINALIZED`: 투표 종료, key reveal 및 복호화/검증/최종 집계까지 완료된 상태
- `CANCELLED`: 투표 취소
- `EXPIRED`: 준비 후 일정 시간 내 on-chain 생성이 이뤄지지 않음
- `FAILED`: 생성 또는 연결 파이프라인 실패

## 5. election_keys

private election의 공개키 및 비공개키 관리 메타데이터를 저장하는 테이블이다.

예상 컬럼:

- `id`
- `election_id`
- `public_key`
- `private_key_commitment_hash`
- `private_key_encrypted`
- `is_revealed`
- `revealed_at`
- `created_at`
- `updated_at`

역할:

- election별 공개키 저장
- 앱 레벨 암호화로 보호된 private key 저장
- reveal 상태 및 관련 메타데이터 관리
- private election 생성 전 key pair를 미리 준비해 저장
- 온체인 election 생성 후 `private_key_commitment_hash` 기준으로 election과 연결

주의:

- 실제 private key 원문은 DB 일반 컬럼에 평문 저장하지 않는다.
- `private_key_encrypted`에는 환경변수 기반 애플리케이션 마스터 키로 암호화한 값만 저장한다.

## 6. election_candidates

election별 후보 목록을 저장하는 테이블이다.

예상 컬럼:

- `id`
- `election_id`
- `candidate_key`
- `display_order`
- `created_at`

역할:

- 후보 목록 조회
- 집계 기준 후보 key 관리
- `candidate_manifest_preimage`를 파싱한 결과를 row 단위로 저장

## 7. vote_submissions

private election의 실제 온체인 vote submission을 저장하는 테이블이다.

예상 컬럼:

- `id`
- `election_id`
- `onchain_tx_hash`
- `voter_address`
- `block_number`
- `block_timestamp`
- `encrypted_ballot`
- `created_at`

역할:

- 체인에 포함된 private vote 원본 추적
- raw ciphertext 보관
- 복호화/재처리 기준 원본 보관

## 8. decrypted_ballots

private ballot 복호화 결과를 저장하는 테이블이다.

예상 컬럼:

- `id`
- `vote_submission_id`
- `candidate_keys`
- `nonce`
- `is_valid`
- `validated_at`
- `created_at`

역할:

- `vote_submissions`의 ciphertext를 복호화한 결과 저장
- tally 반영 전 검증 대상 데이터 저장
- 복호화 결과 재검증 및 재집계 기준 데이터 보관

## 9. invalid_ballots

invalid ballot 정보를 저장하는 테이블이다.

예상 컬럼:

- `id`
- `vote_submission_id`
- `reason_code`
- `reason_detail`
- `created_at`

역할:

- 왜 특정 decrypted ballot이 집계에서 제외됐는지 기록

## 10. live_tally

private ballot 복호화 및 검증 통과분을 기준으로 한 실시간 집계를 저장하는 테이블이다.

예상 컬럼:

- `id`
- `election_id`
- `candidate_key`
- `count`
- `updated_at`

역할:

- private election의 실시간 집계 projection 제공
- `decrypted_ballots` 중 유효표만 반영한 후보별 count 저장

현재 구현:

- `vote_submissions` 1건이 복호화/검증 처리될 때마다 해당 election 전체를 다시 계산한다.
- 즉 `live_tally`는 증분 카운터가 아니라 `decrypted_ballots` 기반 projection이다.

## 11. finalized_tally

최종 공식 집계를 저장하는 테이블이다.

예상 컬럼:

- `id`
- `election_id`
- `candidate_key`
- `count`
- `vote_ratio`
- `finalized_at`

역할:

- private election 최종 공식 후보별 득표수 저장
- private election 최종 후보별 득표 비율 저장

현재 구현:

- 백엔드 인덱서가 on-chain election 상태를 읽어 `FINALIZED`로 매핑되는 시점에 재계산한다.
- 계산 기준 원본은 여전히 `decrypted_ballots`의 유효표다.

## 12. result_summaries

최종 결과 요약을 저장하는 테이블이다.

예상 컬럼:

- `id`
- `election_id`
- `total_submissions`
- `total_decrypted_ballots`
- `total_valid_votes`
- `total_invalid_votes`
- `created_at`

역할:

- private election 최종 결과 요약 저장
- finalized 결과와 연결

현재 구현:

- `finalized_tally`를 만들 때 함께 재계산한다.
- `total_submissions`, `total_decrypted_ballots`, `total_valid_votes`, `total_invalid_votes`를 저장한다.

주의:

- 후보별 최종 득표수와 득표 비율은 `result_summaries`에 넣지 않는다.
- 후보별 결과는 `finalized_tally`가 담당한다.

## 관계 요약

- `admin_users 1:N verified_organizers`
- `election_groups 1:N elections`
- `elections 1:1 election_keys`
- `elections 1:N election_candidates`
- `elections 1:N vote_submissions`
- `elections 1:N live_tally`
- `elections 1:N finalized_tally`
- `elections 1:1 result_summaries`
- `vote_submissions 1:1 decrypted_ballots`
- `vote_submissions 1:N invalid_ballots`

## 운영 규칙 요약

### OPEN election

- 프론트가 컨트랙트에서 직접 조회한다.
- 프론트가 컨트랙트로 직접 투표를 전송한다.
- 백엔드는 tally를 계산하지 않는다.

### PRIVATE election

- 프론트가 컨트랙트로 직접 투표를 전송한다.
- 백엔드가 ciphertext를 읽고 복호화한다.
- 검증 통과 여부와 무관하게 submission 처리 후 `live_tally`를 election 단위로 재계산한다.
- 그 결과 유효표만 반영된 `live_tally` projection이 유지된다.
- on-chain election 상태가 최종 상태가 되면 인덱서가 `finalized_tally`, `result_summaries`를 재계산한다.

### election 생성 시 후보 저장 방식

- 프론트는 election 생성 시 컨트랙트에 해시로 올릴 원문 데이터를 백엔드에 먼저 보낸다.
- 예: `title`, `group_key`, 후보 원본 메시지
- 백엔드는 `title`, `election_groups.group_key`, `candidate_manifest_preimage` 형태로 원문을 저장한다.
- 백엔드는 그 원본을 `elections.candidate_manifest_preimage`에 저장한다.
- 백엔드는 같은 메시지를 파싱해 `election_candidates` row들을 만든다.
- 프론트는 이후 컨트랙트 생성 트랜잭션에 필요한 해시값만 올린다.
