import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = 'http://44.203.66.174';

const spotsDuration   = new Trend('spots_duration',   true);
const routeDuration   = new Trend('route_duration',   true);
const chatDuration    = new Trend('chat_duration',    true);
const errorRate       = new Rate('error_rate');

export const options = {
  scenarios: {
    // 1단계: 워밍업 (10명, 30초)
    warmup: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '30s', target: 10 },
        { duration: '10s', target: 0  },
      ],
      gracefulRampDown: '10s',
      tags: { phase: 'warmup' },
    },
    // 2단계: 부하 증가 (최대 50명)
    load: {
      executor: 'ramping-vus',
      startTime: '80s',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50  },
        { duration: '60s', target: 50  },
        { duration: '20s', target: 100 },
        { duration: '60s', target: 100 },
        { duration: '20s', target: 0   },
      ],
      gracefulRampDown: '10s',
      tags: { phase: 'load' },
    },
  },
  thresholds: {
    // 전체 요청 기준
    http_req_duration:    ['p(95)<2000'],  // 95th percentile 2초 이내
    http_req_failed:      ['rate<0.05'],   // 에러율 5% 미만
    // API별 기준
    spots_duration:       ['p(95)<500'],   // spots: 500ms 이내
    route_duration:       ['p(95)<3000'],  // route: 3초 이내 (TSP 계산)
    chat_duration:        ['p(95)<10000'], // chat: 10초 이내 (Claude API)
  },
};

// 관광지 검색 테스트
function testSpots() {
  const params = [
    '?areaCode=1&contentTypeId=12',
    '?areaCode=1&contentTypeId=14',
    '?areaCode=6&contentTypeId=12',
    '?keyword=' + encodeURIComponent('경복궁'),
    '?keyword=' + encodeURIComponent('남산타워'),
  ];
  const url = BASE_URL + '/api/spots' + params[Math.floor(Math.random() * params.length)];
  const res = http.get(url, { tags: { api: 'spots' } });

  spotsDuration.add(res.timings.duration);
  const ok = check(res, {
    'spots status 200': (r) => r.status === 200,
    'spots has data':   (r) => r.body && r.body.length > 2,
  });
  errorRate.add(!ok);
}

// 경로 최적화 테스트
function testRoute() {
  const payload = JSON.stringify([
    { title: '경복궁',    lat: 37.5796,  lng: 126.9770 },
    { title: 'N서울타워', lat: 37.5512,  lng: 126.9882 },
    { title: '홍대입구',  lat: 37.5572,  lng: 126.9243 },
    { title: '명동',      lat: 37.5636,  lng: 126.9828 },
  ]);
  const res = http.post(
    BASE_URL + '/api/route/optimize',
    payload,
    { headers: { 'Content-Type': 'application/json' }, tags: { api: 'route' } }
  );

  routeDuration.add(res.timings.duration);
  const ok = check(res, {
    'route status 200': (r) => r.status === 200,
  });
  errorRate.add(!ok);
}

// AI 챗봇 테스트
function testChat() {
  const questions = [
    '서울 당일치기 코스 추천해줘',
    '가족과 함께 가기 좋은 관광지 알려줘',
    '야경 명소 추천해줘',
  ];
  const payload = JSON.stringify({
    message: questions[Math.floor(Math.random() * questions.length)],
    history: [],
  });
  const res = http.post(
    BASE_URL + '/api/chatbot/ask',
    payload,
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: '30s',
      tags: { api: 'chat' },
    }
  );

  chatDuration.add(res.timings.duration);
  const ok = check(res, {
    'chat status 200': (r) => r.status === 200,
  });
  errorRate.add(!ok);
}

export default function () {
  const rand = Math.random();

  if (rand < 0.6) {
    // 60% — 관광지 검색 (가장 많이 쓰는 API)
    testSpots();
    sleep(1);
  } else if (rand < 0.85) {
    // 25% — 경로 최적화
    testRoute();
    sleep(2);
  } else {
    // 15% — AI 챗봇
    testChat();
    sleep(3);
  }
}
