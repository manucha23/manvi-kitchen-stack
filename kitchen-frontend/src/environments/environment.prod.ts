export const environment = {
  production: true,
  apiUrl: (window as any).env?.apiUrl || '',
  aws: {
    region: (window as any).env?.region || 'ap-south-1',
    userPoolId: (window as any).env?.userPoolId || '',
    userPoolClientId: (window as any).env?.userPoolClientId || ''
  }
};