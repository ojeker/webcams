export class WorkerClient {
  private readonly baseUrl: URL;

  constructor(baseUrl: string) {
    this.baseUrl = new URL(baseUrl);
  }

  imageUrl(sourceUrl: string): string {
    const url = new URL('/api/image', this.baseUrl);
    url.searchParams.set('url', sourceUrl);
    return url.toString();
  }

  htmlImageUrl(pageUrl: string, selector?: string): string {
    const url = new URL('/api/html-image', this.baseUrl);
    url.searchParams.set('page', pageUrl);
    if (selector) {
      url.searchParams.set('selector', selector);
    }
    return url.toString();
  }
}
