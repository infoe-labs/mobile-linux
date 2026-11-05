class DownloadRequests extends EventTarget {
  url = '';
  request(value: string) {
    if (this.url) return;
    const url = new URL(value);
    if (value.length > 2048 || url.protocol !== 'https:' || url.username || url.password) return;
    this.url = url.href;
    this.dispatchEvent(new Event('change'));
  }
  clear() {
    this.url = '';
    this.dispatchEvent(new Event('change'));
  }
}
export const downloads = new DownloadRequests();
