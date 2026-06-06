@echo off
echo ========================================
echo   星际辩台 - 一键安装脚本
echo ========================================
echo.

:: 检查 Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装：https://nodejs.org
    pause
    exit /b 1
)
echo [OK] Node.js: 
node --version

:: 检查 Ollama
where ollama >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [警告] 未检测到 Ollama，本地模型将不可用
    echo        安装：https://ollama.com
) else (
    echo [OK] Ollama:
    ollama --version
)

echo.

:: 安装依赖
echo [1/3] 安装项目依赖...
call npm install
if %ERRORLEVEL% neq 0 (
    echo [错误] 依赖安装失败
    pause
    exit /b 1
)
echo [OK] 依赖安装完成

:: 创建 .env（如果不存在）
if not exist .env (
    echo [2/3] 创建配置文件...
    copy .env.example .env >nul
    echo [OK] 已创建 .env，请编辑填入 API 密钥（可选）
) else (
    echo [2/3] .env 已存在，跳过
)

:: 初始化数据库
echo [3/3] 初始化数据库...
npx prisma db push
if %ERRORLEVEL% neq 0 (
    echo [错误] 数据库初始化失败
    pause
    exit /b 1
)
echo [OK] 数据库初始化完成

echo.
echo ========================================
echo   安装完成！
echo.
echo   启动：npx next dev -p 3000
echo   访问：http://localhost:3000
echo ========================================
pause
