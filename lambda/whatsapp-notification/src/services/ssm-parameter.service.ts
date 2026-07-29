import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

export class SsmParameterService {
  private ssmClient: SSMClient;
  private parameterCache: Map<string, string>;

  constructor(ssmClient?: SSMClient) {
    this.ssmClient = ssmClient || new SSMClient({});
    this.parameterCache = new Map<string, string>();
  }

  public async getParameter(parameterName: string): Promise<string> {
    const cached = this.parameterCache.get(parameterName);
    if (cached) {
      return cached;
    }

    const response = await this.ssmClient.send(
      new GetParameterCommand({
        Name: parameterName,
        WithDecryption: true,
      })
    );

    const value = response.Parameter?.Value;
    if (!value) {
      throw new Error(`SSM parameter not found or empty: ${parameterName}`);
    }

    this.parameterCache.set(parameterName, value);
    return value;
  }

  public clearCache(): void {
    this.parameterCache.clear();
  }
}
