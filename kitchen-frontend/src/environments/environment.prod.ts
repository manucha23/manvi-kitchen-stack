export const environment = {
  production: true,
  apiUrl: (window as any).env?.apiUrl || '',
  adminApiUrl: (window as any).env?.adminApiUrl || (window as any).env?.apiUrl || '',
  aws: {
    region: (window as any).env?.region || 'ap-south-1',
    adminUserPoolId: (window as any).env?.adminUserPoolId || (window as any).env?.userPoolId || '',
    adminUserPoolClientId: (window as any).env?.adminUserPoolClientId || (window as any).env?.userPoolClientId || ''
  }
};