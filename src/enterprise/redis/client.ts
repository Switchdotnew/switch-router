import Redis, { type RedisOptions } from 'ioredis';
import log from '../../utils/logging.js';
import type { RedisConfig } from '../../types/shared/redis-config.js';
import type { IRedisConnectionStatus } from '../../types/domains/enterprise.js';
import { RedisConnectionError, RedisOperationError } from './errors.js';

export class EnterpriseRedisClient {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private config: RedisConfig;
  private reconnectAttempts = 0;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;
  private lastConnectedAt?: Date;
  private lastErrorAt?: Date;
  private lastError?: string;

  constructor(config: RedisConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    // Prevent multiple simultaneous connection attempts
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this._connect();
    return this.connectionPromise;
  }

  private async _connect(): Promise<void> {
    try {
      log.info('Establishing Redis connection...', {
        url: this.config.url.replace(/\/\/[^@]*@/, '//***:***@'), // Mask credentials
        connectTimeout: this.config.connectTimeout,
        commandTimeout: this.config.commandTimeout,
      });

      // Main client for commands
      const clientOptions: RedisOptions = {
        connectTimeout: this.config.connectTimeout,
        commandTimeout: this.config.commandTimeout,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
        keepAlive: 30000,
        // Connection pool settings
        family: 4, // Force IPv4
        db: 0,
      };
      
      this.client = new Redis(this.config.url, clientOptions);

      // Separate client for pub/sub (recommended by ioredis)
      const subscriberOptions: RedisOptions = {
        connectTimeout: this.config.connectTimeout,
        commandTimeout: this.config.commandTimeout,
        lazyConnect: true,
        keepAlive: 30000,
        family: 4,
        db: 0,
      };
      
      this.subscriber = new Redis(this.config.url, subscriberOptions);

      // Connect both clients
      await Promise.all([
        this.client.connect(),
        this.subscriber.connect()
      ]);

      this.setupEventHandlers();
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.lastConnectedAt = new Date();
      this.lastError = undefined;
      this.lastErrorAt = undefined;
      
      log.info('✅ Redis connection established successfully', {
        clientStatus: this.client.status,
        subscriberStatus: this.subscriber.status,
      });
    } catch (error) {
      await this.handleConnectionError(error);
    } finally {
      this.connectionPromise = null;
    }
  }

  private setupEventHandlers(): void {
    if (!this.client || !this.subscriber) return;

    // Main client events
    this.client.on('error', (error) => {
      log.error('Redis client error:', error);
      this.isConnected = false;
      this.lastError = error.message;
      this.lastErrorAt = new Date();
    });

    this.client.on('close', () => {
      log.warn('Redis client connection closed');
      this.isConnected = false;
    });

    this.client.on('reconnecting', (delay: number) => {
      log.info(`Redis client reconnecting in ${delay}ms...`);
    });

    this.client.on('connect', () => {
      log.info('Redis client connected');
      this.isConnected = true;
      this.lastConnectedAt = new Date();
    });

    // Subscriber events
    this.subscriber.on('error', (error) => {
      log.error('Redis subscriber error:', error);
      this.lastError = error.message;
      this.lastErrorAt = new Date();
    });

    this.subscriber.on('close', () => {
      log.warn('Redis subscriber connection closed');
    });

    this.subscriber.on('reconnecting', (delay: number) => {
      log.info(`Redis subscriber reconnecting in ${delay}ms...`);
    });

    this.subscriber.on('connect', () => {
      log.debug('Redis subscriber connected');
    });
  }

  private async handleConnectionError(error: unknown): Promise<void> {
    this.reconnectAttempts++;
    this.lastError = error instanceof Error ? error.message : String(error);
    this.lastErrorAt = new Date();
    
    const delay = Math.min(
      this.config.retryDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.config.maxRetryDelay
    );

    log.error(`Redis connection attempt ${this.reconnectAttempts} failed:`, error);

    if (this.reconnectAttempts <= this.config.retryAttempts) {
      log.info(`Retrying Redis connection in ${delay}ms...`);
      setTimeout(() => this.connect(), delay);
    } else {
      const errorMsg = `Redis connection failed after ${this.config.retryAttempts} attempts`;
      log.error(errorMsg);
      throw new RedisConnectionError(errorMsg, error);
    }
  }

  async getConfig(instanceId: string): Promise<string | null> {
    this.ensureConnected();
    
    try {
      const configKey = `${process.env.REDIS_CONFIG_KEY_PREFIX || 'switch:instances'}:${instanceId}:config`;
      const config = await this.client!.get(configKey);
      
      if (config) {
        log.debug(`Configuration retrieved for instance: ${instanceId}`, {
          configLength: config.length,
          configKey,
        });
      } else {
        log.warn(`No configuration found for instance: ${instanceId}`, { configKey });
      }
      
      return config;
    } catch (error) {
      throw new RedisOperationError('Failed to retrieve configuration', error);
    }
  }

  async subscribeToConfigUpdates(
    instanceId: string,
    callback: (config: string) => void
  ): Promise<void> {
    this.ensureConnected();

    try {
      const channelPattern = `${process.env.REDIS_CONFIG_CHANNEL_PREFIX || 'switch:config'}:${instanceId}`;
      
      await this.subscriber!.subscribe(channelPattern);
      log.info(`Subscribed to config updates: ${channelPattern}`);

      this.subscriber!.on('message', (channel, message) => {
        if (channel === channelPattern) {
          log.debug(`Received config update on channel: ${channel}`, {
            messageLength: message.length,
          });
          
          try {
            callback(message);
          } catch (error) {
            log.error('Error in config update callback:', error);
          }
        }
      });
    } catch (error) {
      throw new RedisOperationError('Failed to subscribe to config updates', error);
    }
  }

  async ping(): Promise<string> {
    this.ensureConnected();
    
    try {
      return await this.client!.ping();
    } catch (error) {
      throw new RedisOperationError('Redis ping failed', error);
    }
  }

  getConnectionStatus(): IRedisConnectionStatus {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      clientStatus: this.client?.status || 'disconnected',
      subscriberStatus: this.subscriber?.status || 'disconnected',
      lastConnectedAt: this.lastConnectedAt,
      lastErrorAt: this.lastErrorAt,
      lastError: this.lastError,
    };
  }

  async disconnect(): Promise<void> {
    log.info('Disconnecting from Redis...');
    
    try {
      const promises: Promise<string>[] = [];
      
      if (this.client) {
        promises.push(this.client.quit());
      }
      
      if (this.subscriber) {
        promises.push(this.subscriber.quit());
      }
      
      if (promises.length > 0) {
        await Promise.all(promises);
      }
    } catch (error) {
      log.warn('Error during Redis disconnect:', error);
    }
    
    this.client = null;
    this.subscriber = null;
    this.isConnected = false;
    
    log.info('Redis disconnected');
  }

  private ensureConnected(): void {
    if (!this.isConnected || !this.client || !this.subscriber) {
      throw new RedisConnectionError('Redis client is not connected');
    }

    // Additional health check
    if (this.client.status !== 'ready' || this.subscriber.status !== 'ready') {
      throw new RedisConnectionError('Redis clients are not ready');
    }
  }

  // Health check method for monitoring
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    details: {
      ping: boolean;
      connectionStatus: IRedisConnectionStatus;
      uptime?: number;
    };
  }> {
    try {
      const pingResult = await this.ping();
      const connectionStatus = this.getConnectionStatus();
      
      const uptime = this.lastConnectedAt 
        ? Date.now() - this.lastConnectedAt.getTime()
        : undefined;

      return {
        status: pingResult === 'PONG' && this.isConnected ? 'healthy' : 'unhealthy',
        details: {
          ping: pingResult === 'PONG',
          connectionStatus,
          uptime,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          ping: false,
          connectionStatus: this.getConnectionStatus(),
        },
      };
    }
  }
}