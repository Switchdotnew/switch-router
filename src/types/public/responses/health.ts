export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  models: {
    total: number;
    available: Array<{
      name: string;
      provider: string;
      modelName: string;
      apiBase: string;
      health: {
        isHealthy: boolean;
        responseTime: number;
        lastHealthCheck: Date;
      };
    }>;
  };
  version: string;
}
