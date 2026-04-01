/**
 * Utilitário de segurança para manuseio de strings sensíveis na interface
 */

/**
 * Mascara campos de senha em URLs de provedores IPTV para exibição segura.
 * Exemplos de parâmetros mascarados: password, pass, pwd.
 * 
 * @param urlString A URL original bruta do provedor
 * @returns A URL com os valores de credenciais substituídos por asteriscos para fins visuais
 */
export const maskUrlCredentials = (urlString: string): string => {
  if (!urlString || typeof urlString !== 'string') return urlString;
  if (!urlString.includes('password=') && !urlString.includes('pass=') && !urlString.includes('pwd=')) {
    return urlString;
  }

  try {
    const url = new URL(urlString);
    const sensitiveParams = ['password', 'pass', 'pwd', 'token', 'key'];

    let hasChanges = false;
    sensitiveParams.forEach(param => {
      if (url.searchParams.has(param)) {
        url.searchParams.set(param, '******');
        hasChanges = true;
      }
    });

    return hasChanges ? url.toString() : urlString;
  } catch (e) {
    // Se a URL for inválida (ex: caminhos parciais), tentamos um regex simples de fallback
    return urlString.replace(/(?:password|pass|pwd)=([^&]+)/gi, (match, p1, offset, string) => {
       const key = match.split('=')[0];
       return `${key}=******`;
    });
  }
};
