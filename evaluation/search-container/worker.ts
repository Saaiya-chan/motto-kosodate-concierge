import { Container } from '@cloudflare/containers';
type Env = { SEARCH: DurableObjectNamespace; SEARCH_TOKEN: string };
export class SearchContainer extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = '60s';
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.envVars = { SEARCH_TOKEN: env.SEARCH_TOKEN };
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.SEARCH_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.SEARCH_TOKEN}`)
      return new Response('Unauthorized', { status: 401 });
    const url = new URL(request.url);
    const instance = env.SEARCH.getByName('official-documents-probe');
    if (url.pathname === '/__stop' && request.method === 'POST') {
      await (instance as any).stop();
      return Response.json({stopped:true});
    }
    if (!['/api/search', '/api/health', '/metrics'].includes(url.pathname))
      return new Response('Not found', { status: 404 });
    return instance.fetch(request);
  }
};
