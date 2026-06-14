export const environment = {
  production: false,
  apiUrl: (window as any).env?.apiUrl || 'https://api.test.cravnest.in',
  adminApiUrl: (window as any).env?.adminApiUrl || (window as any).env?.apiUrl || 'https://api.test.cravnest.in',
  aws: {
    region: (window as any).env?.region || 'ap-south-1',
    adminUserPoolId: (window as any).env?.adminUserPoolId || (window as any).env?.userPoolId || '',
    adminUserPoolClientId: (window as any).env?.adminUserPoolClientId || (window as any).env?.userPoolClientId || '3piqi35gdsf73cgbiukb3030k4'
  }
};