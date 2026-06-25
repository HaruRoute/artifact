pipeline {
    agent any

    environment {
        GITHUB_USER = 'HaruRoute'
        // EC2 내 배포 디렉토리
        DEPLOY_DIR  = '/opt/haruroute'
    }

    triggers {
        // GitHub Webhook이 연결되면 자동 트리거
        githubPush()
    }

    stages {

        // ── 1. 소스코드 가져오기 ────────────────────────────────────
        stage('Checkout') {
            steps {
                // Artifact repo 자체는 Jenkins가 자동으로 checkout
                // 나머지 3개 repo를 DEPLOY_DIR에 clone 또는 pull
                sh '''
                    set -e
                    mkdir -p "${DEPLOY_DIR}"

                    for repo in frontend backend ai_server; do
                        target="${DEPLOY_DIR}/${repo}"
                        if [ -d "${target}/.git" ]; then
                            echo "Pulling ${repo}..."
                            git -C "${target}" pull origin main
                        else
                            echo "Cloning ${repo}..."
                            git clone "https://github.com/${GITHUB_USER}/${repo}.git" "${target}"
                        fi
                    done
                '''
            }
        }

        // ── 2. 시크릿 파일 주입 ────────────────────────────────────
        // Jenkins → Manage Credentials에 아래 4개 "Secret file" 등록 필요
        //   haruroute-env          → 루트 .env 내용
        //   haruroute-frontend-env → frontend/.env 내용
        //   haruroute-secret-yml   → application-secret.yml 내용
        //   haruroute-ai-env       → ai_server/.env 내용 (GMS_API_KEY 등)
        stage('Inject Secrets') {
            steps {
                withCredentials([
                    file(credentialsId: 'haruroute-env',          variable: 'ROOT_ENV'),
                    file(credentialsId: 'haruroute-frontend-env', variable: 'FRONTEND_ENV'),
                    file(credentialsId: 'haruroute-secret-yml',   variable: 'SECRET_YML'),
                    file(credentialsId: 'haruroute-ai-env',       variable: 'AI_ENV'),
                ]) {
                    sh '''
                        cp "$ROOT_ENV"     "${DEPLOY_DIR}/.env"
                        cp "$FRONTEND_ENV" "${DEPLOY_DIR}/frontend/.env"
                        cp "$SECRET_YML"   "${DEPLOY_DIR}/backend/src/main/resources/application-secret.yml"
                        cp "$AI_ENV"       "${DEPLOY_DIR}/ai_server/.env"
                    '''
                }

                // docker-compose.yml은 이 Artifact repo에 포함되어 있으므로
                // Jenkins workspace에서 DEPLOY_DIR로 복사
                sh "cp '${WORKSPACE}/docker-compose.yml' '${DEPLOY_DIR}/docker-compose.yml'"
            }
        }

        // ── 3. Docker 이미지 빌드 ──────────────────────────────────
        stage('Build') {
            steps {
                sh '''
                    cd "${DEPLOY_DIR}"
                    docker compose build --no-cache
                '''
            }
        }

        // ── 4. 기존 컨테이너 내리고 새로 올리기 ───────────────────
        stage('Deploy') {
            steps {
                sh '''
                    cd "${DEPLOY_DIR}"
                    docker compose down --remove-orphans
                    docker compose up -d
                    echo "Waiting for containers to start..."
                    sleep 15
                    docker compose ps
                '''
            }
        }

        // ── 5. 헬스 체크 ───────────────────────────────────────────
        stage('Health Check') {
            steps {
                sh '''
                    curl -sf http://localhost/api/actuator/health \
                        && echo "Backend healthy" \
                        || echo "Health check failed — check logs below"
                '''
            }
        }
    }

    post {
        success {
            echo "배포 성공!"
        }
        failure {
            echo "배포 실패 — 최근 50줄 로그:"
            sh '''
                cd "${DEPLOY_DIR}"
                docker compose logs --tail=50
            '''
        }
        always {
            echo "Pipeline result: ${currentBuild.currentResult}"
        }
    }
}
