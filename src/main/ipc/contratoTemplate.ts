// NOVO: modelo inicial do "Contrato de Prestação de Serviços — Licença
// de Uso de Software (SaaS)". IMPORTANTE: isso é um PONTO DE PARTIDA
// pra facilitar, não é aconselhamento jurídico — recomendo revisar
// com um advogado antes de usar pra valer, principalmente as
// cláusulas de responsabilidade, dados (LGPD) e rescisão.
//
// Campos entre {{chaves}} são preenchidos automaticamente com os
// dados de cada obra na hora de exibir o contrato.

export const VERSAO_CONTRATO = '1.0'

export const TEXTO_CONTRATO = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS
LICENÇA DE USO DE SOFTWARE (SaaS) — SISTEMA ADM OBRA

CONTRATADA: BRAVIK SISTEMAS, doravante denominada CONTRATADA, responsável pelo desenvolvimento, manutenção e disponibilização do sistema "ADM OBRA".

CONTRATANTE: {{nome_empresa}}, inscrita no CNPJ sob o nº {{cnpj_empresa}}, doravante denominada CONTRATANTE.

As partes acima identificadas têm, entre si, justo e acertado o presente Contrato de Prestação de Serviços de Licença de Uso de Software, que se regerá pelas cláusulas seguintes:

CLÁUSULA 1ª — DO OBJETO
1.1. O presente contrato tem por objeto a concessão, pela CONTRATADA à CONTRATANTE, de licença de uso não exclusiva do sistema ADM OBRA, plataforma de gestão de obras que abrange, entre outras funcionalidades, controle de Recursos Humanos, Financeiro, Almoxarifado, Estrutura Analítica de Projeto (EAP) e Diário de Obra.
1.2. A licença compreende o acesso ao sistema pelo aplicativo de computador (Windows) e pelo aplicativo web para celular, conforme perfis de usuário definidos pela CONTRATANTE.

CLÁUSULA 2ª — DA MENSALIDADE
2.1. Pela licença de uso ora concedida, a CONTRATANTE pagará à CONTRATADA o valor mensal de {{valor_mensalidade}}, referente ao plano {{nome_plano}}.
2.2. O pagamento será realizado mediante boleto bancário, com vencimento todo dia 10 (dez) do mês subsequente ao mês de competência, gerado e disponibilizado automaticamente dentro do próprio sistema.
2.3. O não pagamento na data de vencimento poderá acarretar a suspensão do acesso ao sistema, sem prejuízo da cobrança dos valores em aberto, acrescidos de juros e multa conforme legislação vigente.
2.4. O valor da mensalidade poderá ser reajustado mediante aviso prévio de 30 (trinta) dias à CONTRATANTE.

CLÁUSULA 3ª — DA VIGÊNCIA
3.1. O presente contrato vigora por prazo indeterminado, a contar da data de assinatura, podendo ser rescindido por qualquer das partes, a qualquer tempo, mediante aviso prévio de 30 (trinta) dias.

CLÁUSULA 4ª — DAS OBRIGAÇÕES DA CONTRATADA
4.1. Manter o sistema em funcionamento, salvo em casos de manutenção programada ou motivo de força maior.
4.2. Prestar suporte técnico à CONTRATANTE em relação ao uso do sistema.
4.3. Zelar pela segurança e integridade dos dados inseridos pela CONTRATANTE, adotando medidas técnicas razoáveis de proteção.

CLÁUSULA 5ª — DAS OBRIGAÇÕES DA CONTRATANTE
5.1. Utilizar o sistema de acordo com sua finalidade, não permitindo acesso a terceiros não autorizados.
5.2. Manter atualizados os dados cadastrais necessários à emissão da cobrança mensal.
5.3. Efetuar o pagamento da mensalidade nos prazos estabelecidos.

CLÁUSULA 6ª — DA PROTEÇÃO DE DADOS (LGPD)
6.1. As partes se comprometem a tratar os dados pessoais inseridos no sistema em conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais), utilizando-os exclusivamente para as finalidades relacionadas à prestação do serviço ora contratado.

CLÁUSULA 7ª — DA RESCISÃO
7.1. O presente contrato poderá ser rescindido a qualquer tempo por qualquer das partes, mediante comunicação prévia de 30 (trinta) dias, sem prejuízo do pagamento dos valores já devidos até a data da rescisão.
7.2. Em caso de rescisão, os dados da CONTRATANTE ficarão disponíveis para exportação por um período de 30 (trinta) dias, após o qual poderão ser excluídos pela CONTRATADA.

CLÁUSULA 8ª — DAS DISPOSIÇÕES GERAIS
8.1. Este contrato é firmado eletronicamente, nos termos da Medida Provisória nº 2.200-2/2001 e da Lei nº 14.063/2020, sendo válido e eficaz entre as partes independentemente de assinatura manuscrita.
8.2. Fica eleito o foro da comarca de domicílio da CONTRATADA para dirimir quaisquer dúvidas oriundas do presente contrato.

E, por estarem assim justas e contratadas, as partes firmam o presente instrumento de forma eletrônica.`

export function preencherContrato(dados: {
  nome_empresa: string
  cnpj_empresa: string | null
  valor_mensalidade: number
  nome_plano?: string
}): string {
  const valorFormatado = dados.valor_mensalidade.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  return TEXTO_CONTRATO
    .replace('{{nome_empresa}}', dados.nome_empresa)
    .replace('{{cnpj_empresa}}', dados.cnpj_empresa ?? 'não informado')
    .replace('{{valor_mensalidade}}', valorFormatado)
    .replace('{{nome_plano}}', dados.nome_plano ?? 'Start')
}
