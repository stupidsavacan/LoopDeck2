export interface RouteRenderLease {
  isCurrent(): boolean;
}

export class RouteRenderCoordinator {
  private generation = 0;

  begin(): RouteRenderLease {
    const generation = ++this.generation;
    return {
      isCurrent: () => generation === this.generation
    };
  }
}
