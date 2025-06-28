import log from '../../utils/logging.js';
import type { Context } from 'hono';
import { completionRequestSchema } from '../../types/public/requests/completion.js';
import { MessageRoleValues } from '../../types/shared/enums.js';
import { getRouter } from '../../utils/enhanced-router.js';
import { transformProviderResponse } from '../../utils/response-transformer.js';
import { getRequestContext } from '../middleware/timeout.js';

export async function handleCompletion(c: Context) {
  try {
    // Get request context from timeout middleware
    const requestContext = getRequestContext(c);
    
    const requestBody = await c.req.json();
    const parsedRequest = completionRequestSchema.parse(requestBody);
    const router = getRouter();

    if (!router.isModelSupported(parsedRequest.model)) {
      return c.json(
        {
          error: {
            message: `Model '${parsedRequest.model}' not found`,
            type: 'invalid_request_error',
            code: 'model_not_found',
          },
        },
        404
      );
    }

    // Note: Text completions are handled via chat completions endpoint for compatibility
    const chatRequest = {
      model: parsedRequest.model,
      messages: [
        {
          role: MessageRoleValues.USER,
          content: Array.isArray(parsedRequest.prompt)
            ? parsedRequest.prompt[0]
            : parsedRequest.prompt,
        },
      ],
      max_tokens: parsedRequest.max_tokens,
      temperature: parsedRequest.temperature,
      stream: parsedRequest.stream,
      top_p: parsedRequest.top_p,
      top_k: parsedRequest.top_k,
      frequency_penalty: parsedRequest.frequency_penalty,
      presence_penalty: parsedRequest.presence_penalty,
      stop: parsedRequest.stop,
      seed: parsedRequest.seed,
      user: parsedRequest.user,
      enable_thinking: parsedRequest.enable_thinking,
      response_format: parsedRequest.response_format,
      provider_params: parsedRequest.provider_params,
    };

    try {
      const { result: response, usedProvider, usedPool } = await router.executeWithPools(
        parsedRequest.model,
        async (client, _providerId, _poolContext) => {
          return await client.chatCompletion(chatRequest, requestContext);
        },
        requestContext
      );

      // Add metadata headers
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

        // Use request context signal if available, otherwise create default timeout
        const streamSignal = requestContext?.signal || AbortSignal.timeout(600000); // 10 minutes default
        const streamDeadline = requestContext?.deadline || (Date.now() + 600000);

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

        return c.json(transformedResult as Record<string, unknown>);
      }
    } catch (error) {
      log.error(
        error instanceof Error ? error : new Error(String(error)),
        `Completion failed for model ${parsedRequest.model}`
      );

      return c.json(
        {
          error: {
            message: 'Failed to process completion',
            type: 'api_error',
            code: 'completion_failed',
          },
        },
        500
      );
    }
  } catch (error) {
    log.error(error instanceof Error ? error : new Error(String(error)), 'Completion error');

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
