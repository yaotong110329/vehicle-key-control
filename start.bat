@echo off
title Vehicle Key Control
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 8080
if errorlevel 1 pause
