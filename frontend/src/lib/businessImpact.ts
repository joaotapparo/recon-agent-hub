// Textos para quem não é da área: por que o achado importa para o negócio e,
// quando a IA não sugeriu correção, o que fazer em termos gerais.

import type { Finding } from '../types';

interface Impact {
  why: string;
  fix: string;
}

const BY_TOOL: Record<string, Impact> = {
  'tls-check': {
    why: 'Clientes podem ver o alerta de "site não seguro", e dados enviados (como senhas) podem ser interceptados.',
    fix: 'Ativar HTTPS com um certificado válido (gratuito via Let\'s Encrypt) e renová-lo automaticamente.',
  },
  'security-headers': {
    why: 'Sem essas proteções, fica mais fácil roubar a sessão de clientes logados ou enganá-los com páginas falsas, e a versão exposta ajuda criminosos a escolher ataques prontos.',
    fix: 'Configurar os cabeçalhos de segurança no servidor web e esconder a versão do software (ajuste de poucas linhas de configuração).',
  },
  'cors-check': {
    why: 'Um site malicioso pode ler dados de clientes que estejam logados no seu sistema.',
    fix: 'Permitir acesso apenas dos domínios da própria empresa na configuração de CORS da API.',
  },
  'email-security': {
    why: 'Golpistas podem enviar e-mails em nome da empresa para clientes e funcionários (phishing), com risco de fraude e dano à marca.',
    fix: 'Publicar registros SPF e DMARC no DNS, começando em modo de monitoramento e evoluindo para bloqueio (p=reject).',
  },
};

const BY_TYPE: Record<Finding['type'], Impact> = {
  sensitive_file: {
    why: 'Arquivos internos com senhas ou configurações estão abertos para qualquer pessoa na internet.',
    fix: 'Remover o arquivo do servidor público imediatamente e trocar todas as senhas e chaves que ele contém.',
  },
  secret: {
    why: 'Uma chave de acesso a sistemas ou serviços pagos pode estar visível no código do site e ser usada por terceiros.',
    fix: 'Revogar e gerar uma nova chave, e mover o uso dela para o servidor (nunca no código que vai para o navegador).',
  },
  endpoint: {
    why: 'O código revela partes internas do sistema que podem virar alvo de ataques se não estiverem protegidas.',
    fix: 'Confirmar que cada rota exige autenticação e não expõe dados além do necessário.',
  },
  takeover: {
    why: 'Um atacante pode assumir um endereço oficial da empresa e publicar conteúdo falso nele.',
    fix: 'Remover o registro de DNS que aponta para o serviço desativado ou reativar o serviço.',
  },
  open_port: {
    why: 'Cada serviço exposto na internet é mais uma porta de entrada para tentativas de invasão.',
    fix: 'Fechar no firewall as portas que não precisam estar públicas.',
  },
  web_config: {
    why: 'Configuração de segurança abaixo do recomendado.',
    fix: 'Revisar a configuração do servidor web seguindo boas práticas.',
  },
};

export function businessImpact(f: Finding): Impact {
  return BY_TOOL[f.sourceTool] ?? BY_TYPE[f.type];
}
