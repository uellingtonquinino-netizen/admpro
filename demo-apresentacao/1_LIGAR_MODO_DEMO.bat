@echo off
chcp 65001 >nul
title ADM PRO - MODO DEMONSTRACAO

REM ============================================================
REM  ANTES DE USAR: troque o caminho abaixo pelo caminho REAL da
REM  pasta compartilhada na rede (ex: \\NOME-DO-SERVIDOR\Publico\demo-admpro).
REM  Os TRES computadores precisam usar este MESMO arquivo .bat
REM  com o MESMO caminho — copie este arquivo (ja editado) pros
REM  outros dois PCs, nao edite em cada um separado.
REM ============================================================
set ADMPRO_DB_PATH=\\TROQUE-AQUI\pasta-compartilhada\otimizzai-demo.db

echo.
echo  ============================================
echo   ADM PRO - MODO DEMONSTRACAO (banco de rede)
echo  ============================================
echo.
echo  Banco desta sessao: %ADMPRO_DB_PATH%
echo.
echo  Se o caminho acima ainda mostrar "TROQUE-AQUI", feche esta
echo  janela, clique com o botao direito neste arquivo, escolha
echo  Editar, corrija o caminho e salve antes de continuar.
echo.
echo  Isto NAO mexe no banco normal deste computador — so aponta
echo  esta sessao pro arquivo de rede, enquanto esta janela ficar
echo  aberta. Fechando o programa e abrindo do jeito de sempre
echo  (sem este atalho), tudo volta ao normal sozinho.
echo.
pause

cd /d "%~dp0.."
call npm run dev
