import './env.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { authRoutes } from './routes/auth.js';
import { oauthRoutes } from './routes/oauth.js';
import { workspaceRoutes } from './routes/workspaces.js';
import { projectRoutes } from './routes/projects.js';
import { contentRoutes } from './routes/content.js';
import { syncRoutes } from './routes/sync.js';
import { tagRoutes } from './routes/tags.js';
import { searchRoutes } from './routes/search.js';
import { profileRoutes } from './routes/profiles.js';
import { usageRoutes } from './routes/usage.js';
import { clientProfileRoutes } from './routes/client-profiles.js';
import { mcpConnectRoutes } from './routes/mcp-connect.js';
import { projectStateRoutes } from './routes/project-state.js';
import { chatRoutes } from './routes/chats.js';
import { carregarAmbiente, type ConfiguracaoAmbiente } from './env.js';

export async function criarApp(configuracao: ConfiguracaoAmbiente = carregarAmbiente()) {
  const app = Fastify({
    logger: configuracao.nodeEnv === 'test'
      ? false
      : {
          redact: [
            'req.headers.authorization',
            'req.body.password',
            'req.body.token',
            'req.body.key',
            'res.body.data.token',
            'res.body.data.key',
          ],
        },
  });

  await app.register(helmet);
  await app.register(cors, {
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      callback(null, origin === configuracao.corsOrigin);
    },
  });
  await app.register(jwt, { secret: configuracao.jwtSecret || 'dev-secret-local-only' });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      return (request.user as { id?: string } | undefined)?.id || request.ip;
    },
  });

  app.decorate('configuracao', configuracao);
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(oauthRoutes, { prefix: '/api/v1/auth' });
  await app.register(workspaceRoutes, { prefix: '/api/v1' });
  await app.register(projectRoutes, { prefix: '/api/v1' });
  await app.register(contentRoutes, { prefix: '/api/v1' });
  await app.register(syncRoutes, { prefix: '/api/v1/sync' });
  await app.register(tagRoutes, { prefix: '/api/v1/tags' });
  await app.register(searchRoutes, { prefix: '/api/v1' });
  await app.register(profileRoutes, { prefix: '/api/v1/profiles' });
  await app.register(clientProfileRoutes, { prefix: '/api/v1' });
  await app.register(projectStateRoutes, { prefix: '/api/v1' });
  await app.register(chatRoutes, { prefix: '/api/v1' });
  await app.register(usageRoutes, { prefix: '/api/v1/usage' });
  await app.register(mcpConnectRoutes, { prefix: '/api/v1/mcp' });

  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    configuracao: ConfiguracaoAmbiente;
  }
}
