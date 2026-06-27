import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = 'http://44.203.66.174'; // 측정 8: 코드 레벨 최적화 후 재측정

const spotsDuration = new Trend('spots_duration', true);
const routeDuration = new Trend('route_duration', true);
const chatDuration  = new Trend('chat_duration',  true);
const errorRate     = new Rate('error_rate');

export const options = {
  // keep-alive 끄기 → Traefik 아티팩트 제거, 실제 에러율 측정
  noConnectionReuse: true,
  scenarios: {
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100  },  // 워밍업
        { duration: '60s', target: 300  },  // 3배
        { duration: '60s', target: 500  },  // 5배
        { duration: '60s', target: 700  },  // 7배
        { duration: '60s', target: 1000 },  // 10배 (한계 탐색)
        { duration: '30s', target: 0    },  // 램프다운
      ],
      gracefulRampDown: '15s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<10000'],  // 측정 목적
    error_rate:        ['rate<0.8'],     // 80% 넘으면 중단
  },
};

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
  const ok = check(res, { 'spots 200': (r) => r.status === 200 });
  errorRate.add(!ok);
}

function testRoute() {
  const payload = JSON.stringify([
    { title: '경복궁',    lat: 37.5796, lng: 126.9770 },
    { title: 'N서울타워', lat: 37.5512, lng: 126.9882 },
    { title: '홍대입구',  lat: 37.5572, lng: 126.9243 },
    { title: '명동',      lat: 37.5636, lng: 126.9828 },
  ]);
  const res = http.post(
    BASE_URL + '/api/route/optimize',
    payload,
    { headers: { 'Content-Type': 'application/json' }, tags: { api: 'route' } }
  );

  routeDuration.add(res.timings.duration);
  const ok = check(res, { 'route 200': (r) => r.status === 200 });
  errorRate.add(!ok);
}

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
    { headers: { 'Content-Type': 'application/json' }, timeout: '30s', tags: { api: 'chat' } }
  );

  chatDuration.add(res.timings.duration);
  const ok = check(res, { 'chat 200': (r) => r.status === 200 });
  errorRate.add(!ok);
}

export default function () {
  // Stress Test: chat 제외 (AI 서버 포화로 결과 왜곡 방지)
  // spots 70%, route 30%
  if (Math.random() < 0.7) {
    testSpots();
    sleep(1);
  } else {
    testRoute();
    sleep(1);
  }
}
