@echo off
title Installing Elysium
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://raw.githubusercontent.com/aatirs7/ElysiumProd/main/setup/install.ps1 | iex"
if errorlevel 1 (
  echo.
  echo   Something went wrong. The message above says what.
  pause
)
