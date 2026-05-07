export const environment = {
  production: false,
  apiUrl: (window as any).env?.apiUrl || 'https://api.test.cravnest.in',
  aws: {
    region: (window as any).env?.region || 'ap-south-1',
    userPoolId: (window as any).env?.userPoolId || '',
    userPoolClientId: (window as any).env?.userPoolClientId || '3piqi35gdsf73cgbiukb3030k4'
  }
};