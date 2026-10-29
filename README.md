# 포켓몬 타자 마스터

초등학생이 포켓몬 이름을 입력하며 한글 타자 연습을 할 수 있는 반응형 웹 게임입니다.

- **게임:** `index.html`
- **공용 랭킹 데이터:** `scores.json` (GitHub 저장소에 저장)
- **공용 랭킹 API:** `worker.js` (Cloudflare Worker)
- **Worker 설정:** `wrangler.toml`
- **기획 기준:** 업로드된 `mvp.md`
- **기술 구성:** HTML/CSS/Vanilla JavaScript + Cloudflare Worker + GitHub Contents API
- **Supabase:** 사용하지 않습니다.

> **설정 상태 안내:** 소스 코드와 설정 파일은 저장소에 있지만, Cloudflare 계정에서 Worker를 배포하고 GitHub 토큰을 Secret으로 등록한 다음, 발급된 Worker URL을 `index.html`에 입력해야 여러 기기에서 공용 랭킹이 작동합니다. 이 설정 전에는 브라우저별 로컬 랭킹만 표시됩니다.

## 1. 게임 실행

1. `index.html`을 브라우저에서 열거나 GitHub Pages로 배포합니다.
2. 트레이너 이름을 입력하고 **모험 시작하기!**를 누릅니다.
3. 화면에 떨어지는 포켓몬 이름을 정확하게 입력하고 Enter 또는 **잡기!**를 누릅니다.
4. 생명력 5개가 모두 소진되면 최종 점수와 TOP 5 랭킹이 표시됩니다.

Tailwind CSS와 Jua 글꼴은 CDN에서 불러오므로 온라인 연결이 필요할 수 있습니다.

## 2. 데이터 흐름

1. 게임은 최종 점수를 Cloudflare Worker의 `POST /scores` 엔드포인트에 전달합니다.
2. Worker가 이름과 점수 형식을 검증합니다.
3. Worker는 서버에만 보관된 GitHub 토큰으로 GitHub Contents API를 호출해 `scores.json`을 갱신합니다.
4. 게임은 `GET /scores`를 통해 공용 점수 목록을 가져옵니다.
5. 모든 기기가 동일한 Worker URL을 사용하면 같은 GitHub JSON 기록을 읽습니다.

GitHub 토큰은 `worker.js`나 `index.html`에 넣지 않습니다. Cloudflare Worker의 Secret에만 저장해야 합니다. Cloudflare는 Worker Secret을 민감한 인증 정보 보관 용도로 제공합니다. urlCloudflare Workers Secrets 문서https://developers.cloudflare.com/workers/configuration/secrets/

## 3. Cloudflare Worker 설정

### 3.1 GitHub Fine-grained token 생성

1. GitHub의 Settings → Developer settings → Personal access tokens → Fine-grained tokens에서 토큰을 생성합니다.
2. Repository access는 **Only select repositories**를 선택하고 `pkm-tjmaster`만 지정합니다.
3. Repository permissions에서 **Contents: Read and write**를 설정합니다.
4. 토큰은 Cloudflare Worker Secret으로만 입력합니다. `index.html`, `worker.js`, README, 공개 저장소 어디에도 토큰을 커밋하지 마세요.

토큰 권한은 필요한 저장소의 Contents 읽기/쓰기만 허용하는 최소 권한으로 설정하세요.

### 3.2 Worker 배포

**방법 A — Cloudflare 대시보드 사용**

1. Cloudflare 계정에 로그인하고 Workers & Pages로 이동합니다.
2. 새 Worker를 만들고 저장소의 `worker.js` 내용을 Worker 편집기에 붙여넣습니다.
3. Worker 이름을 `pkm-tjmaster-leaderboard`로 지정하거나, 아래 단계에서 실제 Worker URL을 사용합니다.
4. Worker의 Settings → Variables and Secrets에서 다음 값을 추가합니다.

일반 변수:

| 이름 | 값 |
|---|---|
| `GITHUB_OWNER` | `MaRaJoa777` |
| `GITHUB_REPO` | `pkm-tjmaster` |
| `GITHUB_BRANCH` | `main` |
| `ALLOWED_ORIGIN` | 게임 사이트의 실제 Origin. 처음 테스트 시 `*`를 사용할 수 있지만, 운영 시 정확한 도메인으로 제한 권장 |

Secret:

| 이름 | 값 |
|---|---|
| `GITHUB_TOKEN` | 앞 단계에서 생성한 Fine-grained token |

5. 저장 후 Deploy를 누릅니다.
6. Worker URL을 확인합니다. 보통 `https://<worker-name>.<account-subdomain>.workers.dev` 형식입니다. 실제 URL은 Cloudflare 대시보드에서 확인하세요.

Cloudflare에서 변수와 Secret을 설정하는 방법은 공식 문서를 참고하세요. urlCloudflare Workers 환경 변수 문서https://developers.cloudflare.com/workers/configuration/environment-variables/

**방법 B — Wrangler CLI 사용**

프로젝트 폴더에서 Wrangler를 설치하고 로그인한 뒤 실행합니다.

```bash
npm install -g wrangler
wrangler login
wrangler secret put GITHUB_TOKEN
wrangler deploy
```

명령을 실행하면 `GITHUB_TOKEN` 값을 입력하라는 프롬프트가 나타납니다. 토큰 값을 명령 줄에 직접 적거나 커밋된 파일에 저장하지 마세요. `wrangler.toml`에는 비밀 값이 없으며, 공개 설정값만 들어 있습니다.

### 3.3 Worker API 테스트

배포한 Worker URL이 `https://YOUR-WORKER.workers.dev`라고 가정합니다.

랭킹 읽기:

```bash
curl https://YOUR-WORKER.workers.dev/scores
```

테스트 점수 제출:

```bash
curl -X POST https://YOUR-WORKER.workers.dev/scores \
  -H "Content-Type: application/json" \
  -d '{"name":"테스트 트레이너","score":12}'
```

성공하면 응답에 `ok: true`가 포함되고, GitHub 저장소의 `scores.json`에 기록이 추가됩니다. 테스트 기록은 실제 랭킹에 남으므로 테스트 후 GitHub에서 확인하세요.

## 4. 게임에 Worker URL 연결

1. GitHub 저장소의 `index.html`을 엽니다.
2. 다음 설정 줄을 찾습니다.

```js
const LEADERBOARD_API_URL = "";
```

3. 따옴표 안에 Worker 기본 URL을 입력합니다. URL 뒤에 `/scores`는 붙이지 않습니다.

```js
const LEADERBOARD_API_URL = "https://YOUR-WORKER.workers.dev";
```

4. 변경 사항을 커밋합니다.
5. 게임 페이지를 새로고침합니다.

시작 화면의 상태 문구가 **GitHub 공용 랭킹**으로 표시되면 Worker에서 점수 목록을 읽어온 것입니다. Worker URL이 비어 있거나 API 연결이 실패하면 해당 브라우저의 로컬 랭킹을 사용하고 안내 문구를 표시합니다.

## 5. GitHub Pages 배포

1. GitHub 저장소의 Settings → Pages를 엽니다.
2. 배포 소스로 Deploy from a branch를 선택합니다.
3. Branch `main`, 폴더 `/(root)`를 선택하고 저장합니다.
4. 표시되는 Pages URL로 게임에 접속합니다.
5. Worker의 `ALLOWED_ORIGIN`을 Pages 사이트의 정확한 Origin으로 변경합니다. 예를 들어 URL이 `https://USERNAME.github.io`라면 해당 Origin을 입력합니다. 프로젝트 페이지가 하위 경로에 있더라도 Origin에는 도메인과 포트만 포함하고 경로는 포함하지 않습니다.
6. `index.html`의 `LEADERBOARD_API_URL`이 배포된 Worker URL과 일치하는지 확인합니다.

로컬 파일을 `file://`로 직접 열어 테스트할 때는 브라우저 Origin이 없거나 `null`일 수 있으므로 CORS 설정에 따라 요청이 거부될 수 있습니다. 가능하면 GitHub Pages에서 테스트하세요.

## 6. 점수 데이터 형식

초기 `scores.json` 구조:

```json
{
  "version": 1,
  "updated_at": null,
  "scores": []
}
```

점수가 저장되면 Worker가 다음 필드를 가진 기록을 배열에 추가합니다.

- `id`: 기록 고유 ID
- `name`: 트레이너 이름
- `score`: 점수
- `created_at`: 기록 저장 시각(UTC ISO 8601)

최대 1,000개 기록을 저장하고, API 응답은 점수 내림차순으로 최대 100개를 반환합니다. 동점이면 먼저 저장된 기록이 우선 표시됩니다.

## 7. MVP 요구사항 구현 점검

| MVP 항목 | 상태 | 비고 |
|---|---|---|
| 어린이용 밝은 포켓몬 테마, 큰 글씨, 둥근 UI | 구현 | 하늘/초원 배경, 색상별 이름표, Jua 폰트 |
| 트레이너 이름 입력 | 구현 | 공백 이름 거부, 길이 제한 |
| 시작/게임/종료 화면 | 구현 | 3단계 화면 전환 |
| 무작위 X 위치에서 단어 낙하 | 구현 | 화면 너비를 고려한 위치 설정 |
| Enter 정답 제출 및 입력창 비우기 | 구현 | 한글 입력 조합 고려 |
| 정답 +1점, 같은 이름이면 더 아래 단어 우선 | 구현 | 화면 Y 좌표 기준 |
| 50/100/150점 레벨 상승 | 구현 | 낙하 속도와 생성 간격 증가 |
| 생명력 5개, 위험선 도달 시 차감 | 구현 | 생명력 소진 시 게임 종료 |
| 시작 화면 TOP 3 / 종료 화면 TOP 5 | 구현 | 공용 API 연결 시 공용 점수 목록 사용 |
| 브라우저별 기록 보존 | 구현 | API 실패 시 로컬 저장 |
| 여러 기기에서 공용 랭킹 | 설정 필요 | Cloudflare Worker 배포 및 URL 입력 후 활성화 |
| 서버 측 부정 점수 방지 | 부분 구현 | 이름/점수 범위 검증만 수행, 게임 진행 자체는 검증하지 않음 |

## 8. 보안 및 알려진 제한

- Worker의 GitHub 토큰은 반드시 Secret으로 보관합니다. 브라우저 코드에 토큰을 넣으면 안 됩니다.
- 공개 게임 API이므로 누구나 점수를 제출할 수 있습니다. 현재는 이름과 점수 범위만 검증하므로 고득점 조작이나 자동 제출을 완전히 방지하지 못합니다.
- 운영 배포에서는 `ALLOWED_ORIGIN`을 실제 게임 도메인으로 제한하세요. CORS는 브라우저 요청 제어이지, 인증이나 봇 방지 기능 자체는 아닙니다.
- 더 강한 악용 방지가 필요하면 Cloudflare Turnstile, 요청 제한, 서버 측 게임 세션 검증 등을 추가해야 합니다.
- GitHub Contents API를 이용한 JSON 파일 갱신 방식은 여러 사용자가 동시에 점수를 제출할 경우 충돌할 수 있습니다. Worker는 충돌 재시도를 수행하지만, 대규모 동시 접속에 적합한 데이터베이스 대체재는 아닙니다.
- 로컬에 저장된 기록은 자동으로 `scores.json`에 이관되지 않습니다.
- Worker를 배포하고 URL을 입력하기 전에는 공용 랭킹이 활성화되지 않습니다.
- Tailwind CSS 및 폰트 CDN을 사용하므로 완전한 오프라인 지원은 제공하지 않습니다.

## 9. 테스트 체크리스트

- [ ] 이름을 입력하지 않으면 게임이 시작되지 않는다.
- [ ] 정답을 맞히면 점수가 1점 증가한다.
- [ ] 50, 100, 150점에서 레벨이 상승한다.
- [ ] 위험선에 단어가 닿으면 생명력이 감소한다.
- [ ] 생명력 0에서 게임이 종료된다.
- [ ] Worker의 GET API가 `scores.json` 기록을 반환한다.
- [ ] POST API로 테스트 점수를 제출하면 `scores.json`이 갱신된다.
- [ ] 시작 화면 TOP 3와 종료 화면 TOP 5가 공용 기록을 반영한다.
- [ ] PC에서 저장한 점수가 모바일에서도 표시된다.
- [ ] Worker 설정 오류/네트워크 오류 시 안내 문구가 나타나고 게임 자체는 진행 가능하다.
- [ ] 운영 환경에서 CORS 허용 Origin을 실제 게임 도메인으로 제한했다.

## 10. 기술 참고

- Cloudflare Workers Secrets: urlCloudflare Workers Secretshttps://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Workers 환경 변수: urlCloudflare Workers 환경 변수https://developers.cloudflare.com/workers/configuration/environment-variables/
- GitHub 저장소: urlMaRaJoa777/pkm-tjmasterhttps://github.com/MaRaJoa777/pkm-tjmaster
