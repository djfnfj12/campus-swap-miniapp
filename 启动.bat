@echo off
chcp 65001 >nul
title 校园闲置物品交易小程序
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装 Node.js 22.13 或更高版本。
  echo        下载地址: https://nodejs.org/
  pause
  exit /b 1
)

echo [1/3] 检查演示数据...
node server\seed.js

echo [2/3] 启动服务...
echo.
echo   浏览器访问: http://localhost:3000
echo   演示账号:   20230101 / 123456
echo   按 Ctrl+C 可停止服务
echo.

node server\index.js

pause
