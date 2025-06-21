import log from '../../utils/logging.js';
import type { Context } from 'hono';
import { chatCompletionRequestSchema } from '../../types/public/requests/chat.js';
import { getRouter } from '../../utils/enhanced-router.js';
import { transformProviderResponse } from '../../utils/response-transformer.js';
import { fastValidateChatRequest, shouldUseFastValidation } from '../../utils/fast-validation.js';
import { config } from '../../config.js';
import { getRequestContext } from '../middleware/timeout.js';

export async function handleChatCompletion(c: Context) {
  try {
    // Get request context from timeout middleware
    const requestContext = getRequestContext(c);
    
    const requestBody = await c.req.json();

    // Use fast validation in performance mode, fallback to Zod
    let parsedRequest;
    if (shouldUseFastValidation(config.performance)) {
      const fastValidation = fastValidateChatRequest(requestBody);
      if (!fastValidation.valid || !fastValidation.data) {
        return c.json(
          {
            error: {
              message: fastValidation.error || 'Invalid request format',
              type: 'invalid_request_error',
              code: 'validation_failed',
            },
          },
          400
        );
      }
      parsedRequest = fastValidation.data;
    } else {
      parsedRequest = chatCompletionRequestSchema.parse(requestBody);
    }

    const currentModel = parsedRequest.model;
    const router = getRouter();

    if (!router.isModelSupported(currentModel)) {
      return c.json(
        {
          error: {
            message: `Model '${currentModel}' not found`,
            type: 'invalid_request_error',
            code: 'model_not_found',
          },
        },
        404
      );
    }

    try {
      // Use enhanced router with pool-based routing
      const {
        result: response,
        usedProvider,
        usedFallback,
        usedPool,
      } = await router.executeWithPools(
        currentModel,
        async (client, providerId, poolContext) => {
          // Conditionally log debug info based on performance config
          if (!config.performance?.disable_debug_logging) {
            log.debug(`Executing chat completion with provider ${providerId} via pool ${poolContext.poolId}`);
          }
          return await client.chatCompletion(parsedRequest, requestContext);
        },
        requestContext
      );

      // Add metadata headers
      if (usedFallback) {
        c.header('X-Used-Fallback', 'true');
      }
      c.header('X-Used-Provider', usedProvider);
      if (usedPool) {
        c.header('X-Used-Pool', usedPool);
      }

      if (parsedRequest.stream) {
        c.header('Content-Type', 'text/event-stream');
        c.header('Cache-Control', 'no-cache');
        c.header('Connection', 'keep-alive');

        // Use request context for streaming timeout management
        const streamId = `${Date.now()}-${Math.random()}`;
        let streamActive = true;

        // Calculate streaming timeout from configuration or request context
        const timeoutConfig = config.timeout;
        const streamTimeoutMs = timeoutConfig?.streamingTimeoutMs || 600000; // 10 minutes default
        
        // Use request context signal if available, otherwise create new timeout
        const streamSignal = requestContext?.signal || AbortSignal.timeout(streamTimeoutMs);
        const streamDeadline = requestContext?.deadline || (Date.now() + streamTimeoutMs);

        // Create response stream with client disconnect detection
        const wrappedStream = new ReadableStream({
          start(controller) {
            if (!response.body) {
              controller.close();
              return;
            }

            const reader = response.body.getReader();

            // Handle abort signal from request context or stream timeout
            streamSignal.addEventListener('abort', () => {
              streamActive = false;
              reader.cancel('Client disconnected or stream aborted');
              controller.close();
              
              const reason = streamSignal.reason || 'Unknown reason';
              const isTimeout = Date.now() > streamDeadline;
              
              if (isTimeout) {
                log.warn(`Stream ${streamId} timed out: ${reason}`);
              } else {
                log.debug(`Stream ${streamId} aborted: ${reason}`);
              }
            });

            // Pump stream data
            const pump = async (): Promise<void> => {
              try {
                while (streamActive) {
                  const { done, value } = await reader.read();
                  
                  if (done) {
                    streamActive = false;
                    controller.close();
                    break;
                  }

                  if (streamSignal.aborted) {
                    break;
                  }

                  controller.enqueue(value);
                }
              } catch (error) {
                streamActive = false;
                if (!streamSignal.aborted) {
                  log.error(`Stream ${streamId} error:`, error);
                  controller.error(error);
                } else {
                  controller.close();
                }
              } finally {
                // Ensure reader is properly closed
                try {
                  reader.cancel();
                } catch {
                  // Ignore cancellation errors
                }
              }
            };

            pump();
          },

          cancel(reason) {
            streamActive = false;
            log.debug(`Stream ${streamId} cancelled: ${reason}`);
          }
        });

        return new Response(wrappedStream, {
          headers: c.res.headers,
        });
      } else {
        const result = await response.json();

        // Transform provider-specific response formats (e.g., vLLM reasoning_content)
        const transformedResult = transformProviderResponse(result, usedProvider);

        // Add fallback metadata to response for non-streaming
        if (transformedResult && typeof transformedResult === 'object') {
          const metadata = (transformedResult as Record<string, unknown>)._metadata || {};
          (transformedResult as Record<string, unknown>)._metadata = {
            ...metadata,
            usedFallback,
            usedProvider,
          };
        }

        return c.json(transformedResult as Record<string, unknown>);
      }
    } catch (error) {
      log.error(
        error instanceof Error ? error : new Error(String(error)),
        `All providers failed for model ${currentModel}`
      );

      return c.json(
        {
          error: {
            message: 'Failed to process chat completion - all providers unavailable',
            type: 'api_error',
            code: 'all_providers_failed',
          },
        },
        503
      );
    }
  } catch (error) {
    log.error(error instanceof Error ? error : new Error(String(error)), 'Chat completion error');

    if (error instanceof Error && error.name === 'ZodError') {
      return c.json(
        {
          error: {
            message: 'Invalid request format',
            type: 'invalid_request_error',
            code: 'validation_failed',
          },
        },
        400
      );
    }

    return c.json(
      {
        error: {
          message: 'Internal server error',
          type: 'api_error',
          code: 'internal_error',
        },
      },
      500
    );
  }
}
