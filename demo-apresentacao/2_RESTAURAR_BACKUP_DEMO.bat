@echo off
chcp 65001 >nul
title ADM PRO - Restaurar backup da demonstracao

REM ============================================================
REM  Troque os dois caminhos abaixo. BACKUP_LIMPO e uma copia do
REM  banco de demonstracao, guardada intacta, sem ninguem mexer.
REM  BANCO_DEMO e o arquivo que os 3 PCs usam de verdade durante
REM  a demonstracao (o mesmo caminho do ADMPRO_DB_PATH do outro
REM  atalho).
REM
REM  Rode isto ANTES de comecar (garante que todo mundo parte do
REM  mesmo estado) e de novo se algo travar/der erro no meio da
REM  demonstracao — restaura em segundos.
REM
REM  Feche o ADM PRO nos 3 computadores antes de rodar isto.
REM ============================================================
set BACKUP_LIMPO=\\TROQUE-AQUI\pasta-compartilhada\otimizzai-demo-BACKUP.db
set BANCO_DEMO=\\TROQUE-AQUI\pasta-compartilhada\otimizzai-demo.db

echo.
echo  Restaurando:
echo    de:  %BACKUP_LIMPO%
echo    para: %BANCO_DEMO%
echo.
copy /Y "%BACKUP_LIMPO%" "%BANCO_DEMO%"

if %ERRORLEVEL% EQU 0 (
  echo.
  echo  OK — banco de demonstracao restaurado.
) else (
  echo.
  echo  ERRO — confira se os caminhos acima estao certos, se o ADM
  echo  PRO esta fechado nos 3 PCs, e se a pasta de rede esta
  echo  acessivel deste computador.
)
echo.
pause
