export interface IModelHealth {
  isHealthy: boolean;
  responseTime: number;
  lastHealthCheck: Date;
  provider: string;
  apiBase: string;
}

export interface IModelHealthStatus {
  [modelName: string]: IModelHealth;
}

export interface IEndpointHealth {
  baseUrl: string;
  isHealthy: boolean;
  responseTime: number;
}
