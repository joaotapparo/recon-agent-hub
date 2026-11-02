import type {
  Finding, Subdomain, OpenPort, TakeoverRisk,
  Endpoint, Secret, SensitiveFile, HistoryItem, AnalysisStage,
} from './types';

export interface ScanDataset {
  domain: string;
  date: string;
  status: 'completed' | 'running' | 'error';
  stats: {
    subdomains: number;
    activeHosts: number;
    openPorts: number;
    findings: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  stages: AnalysisStage[];
  findings: Finding[];
  subdomains: Subdomain[];
  openPorts: OpenPort[];
  takeoverRisks: TakeoverRisk[];
  endpoints: Endpoint[];
  secrets: Secret[];
  sensitiveFiles: SensitiveFile[];
}

export const scanDatasets: Record<string, ScanDataset> = {
  h1: {
    domain: 'empresa.com.br',
    date: '03/09/2026 às 14:32',
    status: 'completed',
    stats: {
      subdomains: 24,
      activeHosts: 18,
      openPorts: 7,
      findings: 12,
      critical: 2,
      high: 4,
      medium: 3,
      low: 3,
    },
    stages: [
      { name: 'Reconhecimento', status: 'completed', progress: 100 },
      { name: 'Infraestrutura', status: 'completed', progress: 100 },
      { name: 'JavaScript', status: 'completed', progress: 100 },
      { name: 'Validação com IA', status: 'completed', progress: 100 },
      { name: 'Relatório', status: 'completed', progress: 100 },
    ],
    findings: [
      {
        id: 'f1',
        severity: 'critical',
        type: 'secret',
        title: 'Secret exposto — API Key',
        target: 'api.empresa.com.br',
        file: '/static/js/config.js',
        line: 142,
        status: 'confirmed',
        date: '03/09/2026',
        aiValidation: 'Chave com padrão sk_live_ detectada. Classificado como real.',
        description: 'Chave de API encontrada no código JavaScript do domínio principal.',
        evidence: 'sk_live_••••••••••••••••xK9mP',
        reproSteps: ['Acessar https://api.empresa.com.br', 'Abrir DevTools → Sources', 'Localizar /static/js/config.js na linha 142'],
      },
      {
        id: 'f2',
        severity: 'critical',
        type: 'sensitive_file',
        title: 'Arquivo .env acessível publicamente',
        target: 'api.empresa.com.br',
        file: '/.env',
        status: 'confirmed',
        date: '03/09/2026',
        aiValidation: 'Arquivo de variáveis de ambiente exposto. Severidade crítica atribuída automaticamente.',
        description: 'O arquivo .env está acessível publicamente e contém variáveis de ambiente sensíveis.',
        evidence: 'HTTP 200 em api.empresa.com.br/.env',
        reproSteps: ['Acessar https://api.empresa.com.br/.env', 'O servidor retorna HTTP 200 com conteúdo do arquivo'],
      },
      {
        id: 'f3',
        severity: 'high',
        type: 'endpoint',
        title: 'Endpoint /api/admin exposto sem autenticação',
        target: 'api.empresa.com.br',
        file: '/static/js/admin.js',
        line: 89,
        status: 'confirmed',
        date: '03/09/2026',
        aiValidation: 'Rota administrativa sem autenticação aparente detectada.',
        description: 'Endpoint /api/admin encontrado no JavaScript sem evidência de proteção por autenticação.',
        evidence: 'GET /api/admin → HTTP 200 com payload administrativo',
      },
      {
        id: 'f4',
        severity: 'high',
        type: 'sensitive_file',
        title: 'Repositório .git exposto',
        target: 'dev.empresa.com.br',
        file: '/.git/config',
        status: 'confirmed',
        date: '03/09/2026',
        aiValidation: 'Repositório Git acessível. Risco de vazamento de código-fonte.',
        description: 'O diretório .git está acessível publicamente, permitindo extração do código-fonte.',
        evidence: 'HTTP 200 em dev.empresa.com.br/.git/config',
      },
      {
        id: 'f5',
        severity: 'high',
        type: 'takeover',
        title: 'Subdomínio apontando para CNAME não registrado',
        target: 'old.empresa.com.br',
        status: 'confirmed',
        date: '03/09/2026',
        aiValidation: 'CNAME externo órfão detectado.',
        description: 'Subdomínio aponta para provedor externo não reclamado.',
      },
      {
        id: 'f6',
        severity: 'medium',
        type: 'endpoint',
        title: 'Endpoint /api/users lista dados sensíveis',
        target: 'api.empresa.com.br',
        file: '/static/js/api.js',
        status: 'confirmed',
        date: '03/09/2026',
        aiValidation: 'Exposição de PII detectada.',
        description: 'A rota /api/users retorna listagem de usuários com e-mails públicos.',
      },
    ],
    subdomains: [
      { host: 'api.empresa.com.br', status: 'active', ip: '10.0.0.1', ports: [80, 443, 8080] },
      { host: 'dev.empresa.com.br', status: 'active', ip: '10.0.0.2', ports: [22, 80] },
      { host: 'staging.empresa.com.br', status: 'active', ip: '10.0.0.3', ports: [80, 443] },
      { host: 'admin.empresa.com.br', status: 'active', ip: '10.0.0.4', ports: [443] },
      { host: 'mail.empresa.com.br', status: 'active', ip: '10.0.0.5', ports: [25, 587] },
      { host: 'cdn.empresa.com.br', status: 'active', ip: '10.0.0.6', ports: [80, 443] },
      { host: 'old.empresa.com.br', status: 'inactive', ports: [] },
    ],
    openPorts: [
      { host: 'empresa.com.br', port: 443, protocol: 'TCP', service: 'HTTPS' },
      { host: 'empresa.com.br', port: 80, protocol: 'TCP', service: 'HTTP' },
      { host: 'api.empresa.com.br', port: 8080, protocol: 'TCP', service: 'HTTP-ALT' },
      { host: 'dev.empresa.com.br', port: 22, protocol: 'TCP', service: 'SSH' },
      { host: 'mail.empresa.com.br', port: 25, protocol: 'TCP', service: 'SMTP' },
      { host: 'admin.empresa.com.br', port: 443, protocol: 'TCP', service: 'HTTPS' },
      { host: 'mail.empresa.com.br', port: 587, protocol: 'TCP', service: 'SMTP/TLS' },
    ],
    takeoverRisks: [
      { subdomain: 'old.empresa.com.br', cname: 'exemplo.service.com', status: 'Possível takeover', severity: 'high' },
      { subdomain: 'legacy.empresa.com.br', cname: 'cdn-legacy.provider.com', status: 'Possível takeover', severity: 'high' },
    ],
    endpoints: [
      { method: 'GET', path: '/api/users', host: 'api.empresa.com.br', file: 'api.js', aiRelevant: true },
      { method: 'POST', path: '/api/login', host: 'api.empresa.com.br', file: 'auth.js', aiRelevant: false },
      { method: 'GET', path: '/api/admin', host: 'api.empresa.com.br', file: 'admin.js', aiRelevant: true },
      { method: 'GET', path: '/api/config', host: 'api.empresa.com.br', file: 'api.js', aiRelevant: true },
      { method: 'POST', path: '/api/upload', host: 'api.empresa.com.br', file: 'upload.js', aiRelevant: true },
    ],
    secrets: [
      { type: 'API Key', file: 'config.js', maskedValue: 'sk_live_••••••••••••••••xK9mP', aiResult: 'real' },
      { type: 'AWS Key', file: 'main.js', maskedValue: 'AKIA••••••••••••••••', aiResult: 'real' },
    ],
    sensitiveFiles: [
      { filename: '.env', host: 'api.empresa.com.br', accessible: true, severity: 'critical' },
      { filename: '.git/config', host: 'dev.empresa.com.br', accessible: true, severity: 'critical' },
      { filename: 'backup.sql', host: 'dev.empresa.com.br', accessible: false, severity: 'high' },
    ],
  },

  h2: {
    domain: 'teste.com.br',
    date: '02/09/2026 às 10:15',
    status: 'completed',
    stats: {
      subdomains: 8,
      activeHosts: 6,
      openPorts: 3,
      findings: 4,
      critical: 0,
      high: 1,
      medium: 2,
      low: 1,
    },
    stages: [
      { name: 'Reconhecimento', status: 'completed', progress: 100 },
      { name: 'Infraestrutura', status: 'completed', progress: 100 },
      { name: 'JavaScript', status: 'completed', progress: 100 },
      { name: 'Validação com IA', status: 'completed', progress: 100 },
      { name: 'Relatório', status: 'completed', progress: 100 },
    ],
    findings: [
      {
        id: 'tf1',
        severity: 'high',
        type: 'endpoint',
        title: 'Painel phpMyAdmin exposto publicamente',
        target: 'db.teste.com.br',
        file: '/phpmyadmin',
        status: 'confirmed',
        date: '02/09/2026',
        aiValidation: 'Interface de banco de dados detectada em porta 80.',
        description: 'Instância do phpMyAdmin sem restrição por IP encontrada.',
        evidence: 'HTTP 200 - phpMyAdmin 5.1 Login Interface',
      },
      {
        id: 'tf2',
        severity: 'medium',
        type: 'sensitive_file',
        title: 'Arquivo phpinfo.php acessível',
        target: 'teste.com.br',
        file: '/phpinfo.php',
        status: 'confirmed',
        date: '02/09/2026',
        aiValidation: 'Exposição de configurações do servidor PHP.',
        description: 'Arquivo de diagnóstico expõe módulos e versão do servidor.',
        evidence: 'PHP Version 7.4.30 - phpinfo output',
      },
      {
        id: 'tf3',
        severity: 'medium',
        type: 'endpoint',
        title: 'Swagger UI exposto sem restrição',
        target: 'api.teste.com.br',
        file: '/swagger-ui.html',
        status: 'confirmed',
        date: '02/09/2026',
        aiValidation: 'Documentação da API aberta para consulta.',
        description: 'Rotas internas e estruturas de payload visíveis publicamente.',
        evidence: 'HTTP 200 - OpenAPI 3.0 Documentation',
      },
      {
        id: 'tf4',
        severity: 'low',
        type: 'endpoint',
        title: 'Banner do servidor Apache exposto',
        target: 'teste.com.br',
        status: 'confirmed',
        date: '02/09/2026',
        aiValidation: 'Header Server: Apache/2.4.41 (Ubuntu).',
        description: 'Servidor revela versão exata em cabeçalhos HTTP.',
      },
    ],
    subdomains: [
      { host: 'api.teste.com.br', status: 'active', ip: '192.168.1.10', ports: [80, 443] },
      { host: 'db.teste.com.br', status: 'active', ip: '192.168.1.11', ports: [80, 3306] },
      { host: 'homolog.teste.com.br', status: 'active', ip: '192.168.1.12', ports: [443] },
      { host: 'mail.teste.com.br', status: 'active', ip: '192.168.1.13', ports: [25] },
    ],
    openPorts: [
      { host: 'teste.com.br', port: 443, protocol: 'TCP', service: 'HTTPS' },
      { host: 'teste.com.br', port: 80, protocol: 'TCP', service: 'HTTP' },
      { host: 'db.teste.com.br', port: 3306, protocol: 'TCP', service: 'MYSQL' },
    ],
    takeoverRisks: [],
    endpoints: [
      { method: 'GET', path: '/swagger-ui.html', host: 'api.teste.com.br', file: 'docs.js', aiRelevant: true },
      { method: 'GET', path: '/api/v1/status', host: 'api.teste.com.br', file: 'health.js', aiRelevant: false },
    ],
    secrets: [],
    sensitiveFiles: [
      { filename: 'phpinfo.php', host: 'teste.com.br', accessible: true, severity: 'medium' },
    ],
  },

  h3: {
    domain: 'exemplo.com',
    date: '01/09/2026 às 18:40',
    status: 'error',
    stats: {
      subdomains: 2,
      activeHosts: 0,
      openPorts: 0,
      findings: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    },
    stages: [
      { name: 'Reconhecimento', status: 'completed', progress: 100 },
      { name: 'Infraestrutura', status: 'error', progress: 40 },
      { name: 'JavaScript', status: 'pending', progress: 0 },
      { name: 'Validação com IA', status: 'pending', progress: 0 },
      { name: 'Relatório', status: 'pending', progress: 0 },
    ],
    findings: [],
    subdomains: [
      { host: 'exemplo.com', status: 'inactive', ip: 'Bloqueado por WAF', ports: [] },
    ],
    openPorts: [],
    takeoverRisks: [],
    endpoints: [],
    secrets: [],
    sensitiveFiles: [],
  },

  h4: {
    domain: 'cliente-abc.com.br',
    date: '31/08/2026 às 16:05',
    status: 'completed',
    stats: {
      subdomains: 16,
      activeHosts: 12,
      openPorts: 5,
      findings: 7,
      critical: 1,
      high: 2,
      medium: 2,
      low: 2,
    },
    stages: [
      { name: 'Reconhecimento', status: 'completed', progress: 100 },
      { name: 'Infraestrutura', status: 'completed', progress: 100 },
      { name: 'JavaScript', status: 'completed', progress: 100 },
      { name: 'Validação com IA', status: 'completed', progress: 100 },
      { name: 'Relatório', status: 'completed', progress: 100 },
    ],
    findings: [
      {
        id: 'cf1',
        severity: 'critical',
        type: 'secret',
        title: 'Credencial de Banco de Dados Hardcoded',
        target: 'app.cliente-abc.com.br',
        file: '/bundle.min.js',
        line: 412,
        status: 'confirmed',
        date: '31/08/2026',
        aiValidation: 'String de conexão postgresql:// encontrada em bundle público.',
        description: 'String de conexão com usuário e senha do PostgreSQL exposta no client-side.',
        evidence: 'postgresql://postgres:p@ssw0rd123@db.cliente-abc.com.br:5432/production',
      },
      {
        id: 'cf2',
        severity: 'high',
        type: 'sensitive_file',
        title: 'Dump de Banco de Dados backup.sql acessível',
        target: 'static.cliente-abc.com.br',
        file: '/backup.sql',
        status: 'confirmed',
        date: '31/08/2026',
        aiValidation: 'Arquivo .sql de 45MB exposto publicamente para download.',
        description: 'Backup de banco de dados deixado inadvertidamente no servidor web.',
        evidence: 'HTTP 200 - Content-Length: 47185920 bytes',
      },
      {
        id: 'cf3',
        severity: 'high',
        type: 'takeover',
        title: 'Bucket S3 órfão com risco de Takeover',
        target: 'assets.cliente-abc.com.br',
        status: 'confirmed',
        date: '31/08/2026',
        aiValidation: 'CNAME apontando para bucket inexistente s3-sa-east-1.amazonaws.com.',
        description: 'Qualquer atacante pode criar o bucket e assumir o subdomínio.',
        evidence: 'NoSuchBucket: The specified bucket does not exist',
      },
      {
        id: 'cf4',
        severity: 'medium',
        type: 'endpoint',
        title: 'Endpoint /graphql com Introspection Ativo',
        target: 'api.cliente-abc.com.br',
        file: '/graphql',
        status: 'confirmed',
        date: '31/08/2026',
        aiValidation: 'Esquema completo do banco e mutations vazado via consulta __schema.',
        description: 'Introspection ativada permite engenharia reversa de todas as queries da API.',
      },
      {
        id: 'cf5',
        severity: 'medium',
        type: 'secret',
        title: 'Google Maps API Key sem restrição de HTTP referrer',
        target: 'app.cliente-abc.com.br',
        file: '/main.js',
        status: 'confirmed',
        date: '31/08/2026',
        aiValidation: 'Chave pública sem travas de domínio.',
        description: 'Chave pode ser utilizada por terceiros gerando custos e abusos.',
      },
      {
        id: 'cf6',
        severity: 'low',
        type: 'endpoint',
        title: 'Diretório /uploads com Directory Listing ativado',
        target: 'cliente-abc.com.br',
        status: 'confirmed',
        date: '31/08/2026',
        aiValidation: 'Index of /uploads visível no browser.',
        description: 'Listagem de arquivos enviados por usuários sem proteção.',
      },
      {
        id: 'cf7',
        severity: 'low',
        type: 'endpoint',
        title: 'Cookie de sessão sem flag HttpOnly e Secure',
        target: 'app.cliente-abc.com.br',
        status: 'confirmed',
        date: '31/08/2026',
        aiValidation: 'Cookie de autenticação suscetível a XSS.',
        description: 'Cookies sensíveis definidos sem os atributos de segurança recomendados.',
      },
    ],
    subdomains: [
      { host: 'app.cliente-abc.com.br', status: 'active', ip: '54.233.10.1', ports: [80, 443] },
      { host: 'api.cliente-abc.com.br', status: 'active', ip: '54.233.10.2', ports: [443, 8443] },
      { host: 'assets.cliente-abc.com.br', status: 'active', ip: '54.233.10.3', ports: [80, 443] },
      { host: 'static.cliente-abc.com.br', status: 'active', ip: '54.233.10.4', ports: [80] },
      { host: 'vpn.cliente-abc.com.br', status: 'active', ip: '54.233.10.5', ports: [1194, 443] },
    ],
    openPorts: [
      { host: 'app.cliente-abc.com.br', port: 443, protocol: 'TCP', service: 'HTTPS' },
      { host: 'api.cliente-abc.com.br', port: 8443, protocol: 'TCP', service: 'HTTPS-ALT' },
      { host: 'vpn.cliente-abc.com.br', port: 1194, protocol: 'UDP', service: 'OPENVPN' },
      { host: 'static.cliente-abc.com.br', port: 80, protocol: 'TCP', service: 'HTTP' },
      { host: 'cliente-abc.com.br', port: 443, protocol: 'TCP', service: 'HTTPS' },
    ],
    takeoverRisks: [
      { subdomain: 'assets.cliente-abc.com.br', cname: 'assets-bucket.s3.amazonaws.com', status: 'Possível takeover', severity: 'high' },
    ],
    endpoints: [
      { method: 'POST', path: '/graphql', host: 'api.cliente-abc.com.br', file: 'graphql.js', aiRelevant: true },
      { method: 'GET', path: '/uploads', host: 'cliente-abc.com.br', file: 'files.js', aiRelevant: true },
      { method: 'POST', path: '/auth/jwt', host: 'api.cliente-abc.com.br', file: 'auth.js', aiRelevant: true },
    ],
    secrets: [
      { type: 'Postgres URL', file: 'bundle.min.js', maskedValue: 'postgresql://postgres:••••••••@db:5432', aiResult: 'real' },
      { type: 'Google Maps Key', file: 'main.js', maskedValue: 'AIzaSy••••••••••••••', aiResult: 'real' },
    ],
    sensitiveFiles: [
      { filename: 'backup.sql', host: 'static.cliente-abc.com.br', accessible: true, severity: 'high' },
      { filename: 'docker-compose.yml', host: 'app.cliente-abc.com.br', accessible: false, severity: 'medium' },
    ],
  },
};

export const currentDomain = scanDatasets.h1.domain;
export const analysisDate = scanDatasets.h1.date;
export const analysisStatus = scanDatasets.h1.status;
export const summaryStats = scanDatasets.h1.stats;
export const analysisStages = scanDatasets.h1.stages;
export const findings = scanDatasets.h1.findings;
export const subdomains = scanDatasets.h1.subdomains;
export const openPorts = scanDatasets.h1.openPorts;
export const takeoverRisks = scanDatasets.h1.takeoverRisks;
export const endpoints = scanDatasets.h1.endpoints;
export const secrets = scanDatasets.h1.secrets;
export const sensitiveFiles = scanDatasets.h1.sensitiveFiles;

export const history: HistoryItem[] = [
  { id: 'h1', domain: 'empresa.com.br', date: '03/09/2026', status: 'completed', findingsCount: 12 },
  { id: 'h2', domain: 'teste.com.br', date: '02/09/2026', status: 'completed', findingsCount: 4 },
  { id: 'h3', domain: 'exemplo.com', date: '01/09/2026', status: 'error' },
  { id: 'h4', domain: 'cliente-abc.com.br', date: '31/08/2026', status: 'completed', findingsCount: 7 },
];
