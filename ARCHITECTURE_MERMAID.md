# VESTAr Backend Architecture

발표용 단일 아키텍처 다이어그램이다.  
핵심 메시지는 아래 세 줄이다.

- 프론트는 지갑으로 컨트랙트에 직접 write tx를 보낸다.
- 백엔드는 prepare, indexing, projections, workers를 담당한다.
- 최종 UI는 backend projection + IPFS metadata를 합쳐서 렌더링한다.

```mermaid
flowchart LR
  %% =========================
  %% Presentation Architecture
  %% =========================

  subgraph CLIENT["Client Layer"]
    FE["vestar-frontend<br/>React + Vite + Wagmi"]
    VP["verification portal<br/>contract/IPFS verifier"]
  end

  subgraph OFFCHAIN["Off-chain Backend Layer"]
    API["NestJS API<br/>prepare / queries / uploads / verified"]
    IDX["Indexer<br/>ElectionCreated / VoteSubmitted / state polling"]
    PROC["Private ballot processor<br/>decrypt + validate"]
    PROJ["Read projections<br/>live_tally / finalized_tally / result_summaries"]
    WKR["Workers<br/>syncState / revealPrivateKey"]
    DB[("PostgreSQL")]
  end

  subgraph ONCHAIN["On-chain Layer"]
    FAC["ElectionFactory"]
    EL["Election instances"]
    REG["Organizer / Karma registries"]
  end

  subgraph CONTENT["Content Layer"]
    IPFS[("IPFS / Pinata")]
  end

  %% Frontend reads/writes
  FE -->|"prepare / elections / history / tally / verified"| API
  FE -->|"wallet tx: createElection"| FAC
  FE -->|"wallet tx: submit vote / finalize"| EL
  FE -->|"metadata fetch"| IPFS
  FE -->|"on-chain reads when needed"| EL
  FE -->|"organizer/karma reads"| REG

  %% Verification portal
  VP -->|"read-only verification"| EL
  VP -->|"manifest / receipts"| IPFS

  %% Backend internals
  API -->|"persist drafts / query state"| DB
  IDX -->|"upsert indexed elections / submissions"| DB
  PROC -->|"decrypted_ballots / invalid_ballots"| DB
  PROJ -->|"rebuild read models"| DB
  WKR -->|"mark worker progress"| DB

  %% Backend onchain interactions
  IDX -->|"poll logs / read config / read state"| FAC
  IDX -->|"poll logs / read tx input / reconcile state"| EL
  PROC -->|"load encrypted key material"| DB
  WKR -->|"syncState() / revealPrivateKey()"| EL

  %% Content / metadata ownership
  API -. "returns locator only<br/>candidateManifestUri / Hash" .-> FE
  FE -. "combines backend response<br/>with manifest metadata" .-> FE
  IPFS -. "title / series / cover image<br/>candidate image" .-> FE

  %% Styling
  classDef client fill:#F4F7FF,stroke:#4C6FFF,stroke-width:1.5px,color:#09101C;
  classDef backend fill:#F8F4FF,stroke:#7C3AED,stroke-width:1.5px,color:#22103A;
  classDef chain fill:#FFF7ED,stroke:#F97316,stroke-width:1.5px,color:#4A2000;
  classDef data fill:#F0FDF4,stroke:#16A34A,stroke-width:1.5px,color:#052E16;
  classDef content fill:#ECFEFF,stroke:#0891B2,stroke-width:1.5px,color:#083344;
  classDef emphasis fill:#FFF1F2,stroke:#E11D48,stroke-width:2px,color:#4C0519;

  class FE,VP client;
  class API,IDX,PROC,PROJ,WKR backend;
  class FAC,EL,REG chain;
  class DB data;
  class IPFS content;
  class API,EL emphasis;
```

## Reading Guide

1. `Frontend` creates manifests and images, uploads them to IPFS, then sends wallet transactions directly to the contracts.
2. `Backend` indexes on-chain events, stores projections in PostgreSQL, and automates state sync / key reveal.
3. `Frontend` renders the final UI by combining backend response fields with IPFS manifest metadata.
