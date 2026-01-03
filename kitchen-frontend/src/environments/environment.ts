export const environment = {
  production: false,
  apiUrl: (window as any).env?.apiUrl || 'http://localhost:3000/api',
  aws: {
    region: (window as any).env?.region || 'ap-south-1',
    userPoolId: (window as any).env?.userPoolId || '',
    userPoolClientId: (window as any).env?.userPoolClientId || ''
  }
};