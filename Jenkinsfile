pipeline {
    agent any

    environment {
        GITHUB_USER   = 'HaruRoute'
        DEPLOY_DIR    = '/opt/haruroute'
        ECR_REGISTRY  = '969658552435.dkr.ecr.us-east-1.amazonaws.com'
        ECR_NAMESPACE = 'haruroute'
        AWS_REGION    = 'us-east-1'
        IMAGE_TAG     = "${BUILD_NUMBER}"
        K3S_HOST      = '18.206.224.73'
        K3S_USER      = 'ubuntu'
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
                        cp -f "$ROOT_ENV"     "${DEPLOY_DIR}/.env"
                        cp -f "$FRONTEND_ENV" "${DEPLOY_DIR}/frontend/.env"
                        cp -f "$SECRET_YML"   "${DEPLOY_DIR}/backend/src/main/resources/application-secret.yml"
                        cp -f "$AI_ENV"       "${DEPLOY_DIR}/ai_server/.env"
                    '''
                }

                // docker-compose.yml은 이 Artifact repo에 포함되어 있으므로
                // Jenkins workspace에서 DEPLOY_DIR로 복사
                sh "cp -f '${WORKSPACE}/docker-compose.yml' '${DEPLOY_DIR}/docker-compose.yml'"
            }
        }

        // ── 3. Docker 이미지 빌드 ──────────────────────────────────
        stage('Build') {
            steps {
                sh '''
                    cd "${DEPLOY_DIR}"
                    docker compose build
                '''
            }
        }

        // ── 4. ECR Push ────────────────────────────────────────────
        stage('Push to ECR') {
            steps {
                sh '''
                    aws ecr get-login-password --region ${AWS_REGION} \
                        | docker login --username AWS --password-stdin ${ECR_REGISTRY}

                    for svc in frontend backend ai_server; do
                        ecr_svc=$(echo $svc | tr _ -)
                        local_image="haruroute-${svc}:latest"
                        docker tag ${local_image} \
                            ${ECR_REGISTRY}/${ECR_NAMESPACE}/${ecr_svc}:${IMAGE_TAG}
                        docker tag ${local_image} \
                            ${ECR_REGISTRY}/${ECR_NAMESPACE}/${ecr_svc}:latest
                        docker push ${ECR_REGISTRY}/${ECR_NAMESPACE}/${ecr_svc}:${IMAGE_TAG}
                        docker push ${ECR_REGISTRY}/${ECR_NAMESPACE}/${ecr_svc}:latest
                    done
                '''
            }
        }

        // ── 5. k3s 클러스터에 배포 ─────────────────────────────────
        stage('Deploy to k3s') {
            steps {
                withCredentials([sshUserPrivateKey(
                    credentialsId: 'k3s-ssh-key',
                    keyFileVariable: 'SSH_KEY'
                )]) {
                    sh '''
                        chmod 600 ${SSH_KEY}

                        # 매니페스트 파일을 k3s EC2로 전송
                        scp -i ${SSH_KEY} -o StrictHostKeyChecking=no \
                            ${WORKSPACE}/k8s/backend-deployment.yaml \
                            ${WORKSPACE}/k8s/frontend-deployment.yaml \
                            ${WORKSPACE}/k8s/ai-server-deployment.yaml \
                            ${WORKSPACE}/k8s/ingress.yaml \
                            ${K3S_USER}@${K3S_HOST}:/tmp/

                        # kubectl apply 후 rollout restart로 새 이미지 반영
                        ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no ${K3S_USER}@${K3S_HOST} "
                            sudo kubectl apply -f /tmp/backend-deployment.yaml
                            sudo kubectl apply -f /tmp/frontend-deployment.yaml
                            sudo kubectl apply -f /tmp/ai-server-deployment.yaml
                            sudo kubectl apply -f /tmp/ingress.yaml
                            sudo kubectl rollout restart deployment/backend deployment/frontend deployment/ai-server
                            sudo kubectl rollout status deployment/backend --timeout=180s
                            sudo kubectl rollout status deployment/frontend --timeout=60s
                            sudo kubectl rollout status deployment/ai-server --timeout=60s
                        "
                    '''
                }
            }
        }

        // ── 6. 헬스 체크 ───────────────────────────────────────────
        stage('Health Check') {
            steps {
                sh """
                    sleep 5
                    curl -sf http://${K3S_HOST}/ -o /dev/null \
                        && echo "Frontend healthy" \
                        || echo "Frontend health check failed"
                    curl -sf http://${K3S_HOST}/api/actuator/health \
                        -o /dev/null -w "%{http_code}" | grep -E "200|401" \
                        && echo " — Backend healthy" \
                        || echo "Backend health check failed"
                """
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
