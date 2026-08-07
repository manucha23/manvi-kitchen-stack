export const environment = {
  production: true,
  apiUrl: (window as any).env?.apiUrl || '',
  adminApiUrl: (window as any).env?.adminApiUrl || (window as any).env?.apiUrl || ''
};
