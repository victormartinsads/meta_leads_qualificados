const store = require('./config/store');

const sampleLeads = [
  {
    lead_id: '1202084930284910',
    email: 'roberto.almeida@empresa.com.br',
    name: 'Roberto Almeida',
    phone: '5511987654321',
    lead_status: 'QUALIFICADO',
    qualification_reason: 'Regra "Dívida Alta Tributária": [qual_o_valor_da_dívida_tribtuária] contains "100 mil"',
    metaSent: true,
    metaSentAt: new Date().toISOString(),
    clientId: 'client_demo',
    created_time: new Date(Date.now() - 3600000).toISOString(),
    answers: {
      id: '1202084930284910',
      created_time: '2026-08-05T09:30:00-03:00',
      ad_name: 'Ad_01_Video_Tributario',
      campaign_name: 'CMM_Form_Nativo_Tributario_B2B',
      form_name: 'Formulário Nativo - Redução de Dívidas',
      'qual_sua_função_na_empresa?': 'Sócio / Proprietário',
      'qual_o_valor_da_dívida_tribtuária': 'Acima de R$ 100 mil',
      'qual_o_valor_do_faturamento_médio_mensal_da_empresa:': 'R$ 50.000 a R$ 100.000',
      'qual_seu_nível_de_prioridade_para_quitar_essa_dívida?': 'Imediata (Próximos 30 dias)',
      'onde_está_a_dívida?': 'Receita Federal / PGFN',
      'qual_seu_principal_objetivo_hoje?': 'Parcelamento especial / Redução de juros',
      'qual_seu_cnpj_ou_cpf_(ou_da_empresa)': '12.345.678/0001-90',
      email: 'roberto.almeida@empresa.com.br',
      nome_completo: 'Roberto Almeida',
      telefone: '(11) 98765-4321',
      lead_status: 'QUALIFICADO'
    }
  },
  {
    lead_id: '1202084930284911',
    email: 'carlos.silva@gmail.com',
    name: 'Carlos Silva',
    phone: '5511976543210',
    lead_status: 'DESQUALIFICADO',
    qualification_reason: 'Desqualificado: Faturamento e valor de dívida baixos',
    metaSent: false,
    clientId: 'client_demo',
    created_time: new Date(Date.now() - 7200000).toISOString(),
    answers: {
      id: '1202084930284911',
      created_time: '2026-08-05T08:15:00-03:00',
      ad_name: 'Ad_02_Imagem_Calculadora',
      campaign_name: 'CMM_Form_Nativo_Tributario_B2B',
      form_name: 'Formulário Nativo - Redução de Dívidas',
      'qual_sua_função_na_empresa?': 'Funcionário / Autônomo',
      'qual_o_valor_da_dívida_tribtuária': 'Até R$ 10 mil',
      'qual_o_valor_do_faturamento_médio_mensal_da_empresa:': 'Sem empresa',
      'qual_seu_nível_de_prioridade_para_quitar_essa_dívida?': 'Apenas pesquisando',
      'onde_está_a_dívida?': 'Não sei',
      'qual_seu_principal_objetivo_hoje?': 'Informações gerais',
      'qual_seu_cnpj_ou_cpf_(ou_da_empresa)': '123.456.789-00',
      email: 'carlos.silva@gmail.com',
      nome_completo: 'Carlos Silva',
      telefone: '(11) 97654-3210',
      lead_status: 'DESQUALIFICADO'
    }
  },
  {
    lead_id: '1202084930284912',
    email: 'mariana.costa@techsolucoes.com.br',
    name: 'Mariana Costa',
    phone: '5521998877665',
    lead_status: 'PENDENTE',
    qualification_reason: 'Aguardando avaliação ou regra automática',
    metaSent: false,
    clientId: 'client_demo',
    created_time: new Date().toISOString(),
    answers: {
      id: '1202084930284912',
      created_time: new Date().toISOString(),
      ad_name: 'Ad_01_Video_Tributario',
      campaign_name: 'CMM_Form_Nativo_Tributario_B2B',
      form_name: 'Formulário Nativo - Redução de Dívidas',
      'qual_sua_função_na_empresa?': 'Diretora Financeira',
      'qual_o_valor_da_dívida_tribtuária': 'R$ 200 mil a R$ 500 mil',
      'qual_o_valor_do_faturamento_médio_mensal_da_empresa:': 'Acima de R$ 150 mil',
      'qual_seu_nível_de_prioridade_para_quitar_essa_dívida?': 'Imediata (Próximos 30 dias)',
      'onde_está_a_dívida?': 'PGFN em dívida ativa',
      'qual_seu_principal_objetivo_hoje?': 'Evitar bloqueio de bens / Negociação urgente',
      'qual_seu_cnpj_ou_cpf_(ou_da_empresa)': '98.765.432/0001-10',
      email: 'mariana.costa@techsolucoes.com.br',
      nome_completo: 'Mariana Costa',
      telefone: '(21) 99887-7665',
      lead_status: 'PENDENTE'
    }
  }
];

store.saveLeadsBatch(sampleLeads);

// Also set sheetHeaders for client_demo
const client = store.getClients().find(c => c.id === 'client_demo');
if (client) {
  client.sheetHeaders = [
    'id', 'created_time', 'ad_id', 'ad_name', 'adset_id', 'adset_name',
    'campaign_id', 'campaign_name', 'form_id', 'form_name', 'is_organic',
    'platform', 'qual_sua_função_na_empresa?', 'qual_o_valor_da_dívida_tribtuária',
    'qual_o_valor_do_faturamento_médio_mensal_da_empresa:',
    'qual_seu_nível_de_prioridade_para_quitar_essa_dívida?', 'onde_está_a_dívida?',
    'qual_seu_principal_objetivo_hoje?', 'qual_seu_cnpj_ou_cpf_(ou_da_empresa)',
    'email', 'nome_completo', 'telefone', 'lead_status'
  ];
  store.saveClient(client);
}

console.log('Sample leads loaded successfully!');
