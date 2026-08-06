export const environment = {
  production: false,
  apiUrl: (window as any).env?.apiUrl || 'https://api.test.cravnest.in',
  adminApiUrl: (window as any).env?.adminApiUrl || (window as any).env?.apiUrl || 'https://api.test.cravnest.in'
};
