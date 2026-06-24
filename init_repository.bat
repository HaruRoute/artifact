@echo off
cd ..
echo ========================================
echo Git Clone Script
echo ========================================

chcp 65001 > nul

:: artifact 레포지토리
IF NOT EXIST artifact (
    echo [진행] artifact 클론 중...
    git clone https://lab.ssafy.com/s15/a10/project/finalproject/team4/artifact.git
) ELSE (
    echo [스킵] artifact 폴더가 이미 존재합니다.
)

:: backend 레포지토리
IF NOT EXIST backend (
    echo [진행] backend 클론 중...
    git clone https://lab.ssafy.com/s15/a10/project/finalproject/team4/backend.git
) ELSE (
    echo [스킵] backend 폴더가 이미 존재합니다.
)

:: frontend 레포지토리
IF NOT EXIST frontend (
    echo [진행] frontend 클론 중...
    git clone https://lab.ssafy.com/s15/a10/project/finalproject/team4/frontend.git
) ELSE (
    echo [스킵] frontend 폴더가 이미 존재합니다.
)

:: ai_server 레포지토리
IF NOT EXIST ai_server (
    echo [진행] ai_server 클론 중...
    git clone https://lab.ssafy.com/s15/a10/project/finalproject/team4/ai_server.git
) ELSE (
    echo [스킵] ai_server 폴더가 이미 존재합니다.
)

echo ========================================
echo 모든 작업이 완료되었습니다.
pause