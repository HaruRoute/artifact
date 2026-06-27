import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = 'http://44.203.66.174';

const spotsDuration = new Trend('spots_duration', true);
const routeDuration = new Trend('route_duration', true);
const errorRate     = new Rate('error_rate');

export const options = {
  noConnectionReuse: true,
  scenarios: {
    soak: {
      executor: 'ramping-vus',
      stages: [
        { duration: '2m',  target: 200 },  // 워밍업
        { duration: '15m', target: 200 },  // 지속 부하
        { duration: '1m',  target: 0   },  // 램프다운
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    error_rate:        ['rate<0.05'],  // 5% 초과시 실패
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

export default function () {
  if (Math.random() < 0.7) {
    testSpots();
    sleep(1);
  } else {
    testRoute();
    sleep(1);
  }
}
