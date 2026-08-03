# ADM PRO — Demonstração com 3 PCs (guia rápido)

Este guia é só pra amanhã. Ele NÃO muda nada no banco de dados normal
de cada computador — cria um banco separado, só pra demonstração, numa
pasta de rede. Terminando a apresentação, cada PC volta a usar o
banco local de sempre automaticamente (basta não usar o atalho de
demonstração de novo).

## Por que isso é seguro

- O programa só olha pro banco de rede quando é aberto pelo atalho
  `1_LIGAR_MODO_DEMO.bat`. Aberto do jeito normal, ele usa o banco
  local de sempre — como se nada disso existisse.
- O arquivo que os 3 PCs vão usar amanhã é uma **cópia**, nunca o
  banco real da empresa.
- Existe um botão de "desfazer" (`2_RESTAURAR_BACKUP_DEMO.bat`) que
  restaura essa cópia em segundos, caso algo trave no meio da
  demonstração.

## O que preparar HOJE (antes de dormir, se der)

1. **Escolha um dos 3 computadores como "servidor"** — o que vai
   guardar o arquivo compartilhado. Pode ser o seu mesmo.
2. Nesse computador, crie uma pasta e compartilhe ela na rede local
   (botão direito → Propriedades → Compartilhamento → Compartilhar).
   Anote o caminho que aparece, algo como
   `\\NOME-DO-PC\NomeDaPasta`.
3. Copie o `otimizzai.db` de um dos computadores (o que já tem os
   dados de teste que você quer mostrar) pra dentro dessa pasta
   compartilhada, com dois nomes:
   - `otimizzai-demo.db` → o arquivo que vai ser usado de verdade
     amanhã (os 3 PCs escrevem nele).
   - `otimizzai-demo-BACKUP.db` → uma cópia extra, intocável, só
     pra restaurar se precisar.

   O arquivo original fica em
   `C:\Users\<usuário>\AppData\Roaming\otimizzai-financas\otimizzai.db`
   (feche o programa antes de copiar).

4. Nos 3 computadores, a pasta do projeto (a que veio nesse zip)
   precisa ter a pasta `node_modules` dentro dela — é ela que faz o
   `npm run dev` funcionar.

   **Caminho mais seguro e mais rápido**: no computador que já está
   funcionando, copie a pasta `node_modules` inteira (por pendrive ou
   pela rede) e cole dentro da pasta do projeto nos outros 2 PCs —
   desde que os 3 sejam Windows de 64 bits (praticamente certeza).
   Isso evita rodar `npm install` do zero nesses PCs, que em raras
   situações pode pedir Python e ferramentas de compilação C++
   (Visual Studio Build Tools) por causa de uma peça nativa do banco
   de dados — imprevisto que você não quer descobrir amanhã de manhã.

   Só precisa estar instalado de verdade em todos os 3: o **Node.js**
   ([nodejs.org](https://nodejs.org), instalação padrão, 2 minutos).
   Nada de VS Code, Python ou Git é necessário só pra rodar o
   programa.

   Se preferir (ou precisar) instalar do zero mesmo assim, rode
   `npm install` dentro da pasta do projeto — só faça isso HOJE, não
   amanhã de manhã, pra sobrar tempo se algo pedir mais alguma coisa.
5. Abra os dois arquivos `.bat` desta pasta (`1_LIGAR_MODO_DEMO.bat`
   e `2_RESTAURAR_BACKUP_DEMO.bat`) num editor de texto e troque
   `\\TROQUE-AQUI\pasta-compartilhada\...` pelo caminho real que você
   anotou no passo 2, nos dois arquivos.
6. Copie a pasta `demo-apresentacao` inteira (já editada) pros outros
   dois computadores — assim os 3 usam exatamente o mesmo caminho.

## Amanhã, antes da apresentação chegar

1. Rode `2_RESTAURAR_BACKUP_DEMO.bat` (em qualquer um dos 3 PCs) —
   garante que todo mundo começa do mesmo estado, sem lixo de testes
   de ontem à noite.
2. Nos 3 computadores, dê dois cliques em `1_LIGAR_MODO_DEMO.bat` e
   confirme (Enter) na janela preta que abre — o programa abre
   normalmente depois disso, só que "conversando" com o banco
   compartilhado.

## Durante a demonstração

- **Combine com quem for mexer nos outros 2 PCs: só uma pessoa
  grava (salva/autoriza/emite) por vez.** Ver e navegar ao mesmo
  tempo nos 3 não é problema — é só evitar dois cliques de "salvar"
  no mesmo segundo, em telas diferentes.
- Isso ajuda a contar uma história melhor também: PC 1 (ADM) emite
  uma AP → PC 2 (Gestor/Supervisor) autoriza → PC 3 (Escritório
  Central) aprova — mostra o fluxo de aprovação em cadeia de verdade,
  ao vivo, nos 3 computadores.
- Se alguma tela travar ou aparecer erro estranho: feche o programa
  nos 3 PCs, rode `2_RESTAURAR_BACKUP_DEMO.bat` de novo, e abra de
  novo com o atalho 1. Volta ao ar em menos de um minuto.

## Depois da apresentação

Não precisa fazer nada. Assim que fechar o programa e voltar a abrir
do jeito de sempre (sem o atalho `1_LIGAR_MODO_DEMO.bat`), cada PC
volta a usar o próprio banco local, intocado — o banco de
demonstração fica isolado na pasta de rede, sem efeito nenhum no
sistema real de cada um.
