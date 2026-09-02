import { parseRoute, routeHash, type AppRoute } from './routes';

export type RouteListener = (route: AppRoute) => void | Promise<void>;

export class AppRouter {
  constructor(private readonly listener: RouteListener) {}

  start(): AppRoute {
    const parsed = parseRoute(window.location.hash);
    history.replaceState(parsed.route, '', routeHash(parsed.route));
    window.addEventListener('popstate', this.handlePopState);
    void this.listener(parsed.route);
    return parsed.route;
  }

  stop(): void { window.removeEventListener('popstate', this.handlePopState); }

  navigate(route: AppRoute, options: { replace?: boolean } = {}): void {
    const target = routeHash(route);
    if (options.replace) history.replaceState(route, '', target);
    else if (window.location.hash !== target) history.pushState(route, '', target);
    void this.listener(route);
  }

  private readonly handlePopState = (): void => {
    const parsed = parseRoute(window.location.hash);
    if (!parsed.canonical) history.replaceState(parsed.route, '', routeHash(parsed.route));
    void this.listener(parsed.route);
  };
}
