// Keep retry budgets across rerenders, but never retry detached or cancelled images.
export function createImageLoader({ setTimeout, clearTimeout }) {
  const budgets = new Map();
  const jobs = new Set();
  function prune() {
    for (const job of jobs) if (!job.img.isConnected) job.cancel();
  }
  function load(img, { key, sources, onFailure, onSuccess = () => {} }) {
    const urls = [...new Set(sources.filter(Boolean))];
    const budget = budgets.get(key) || { retries: 0, failed: false, success: null };
    budgets.set(key, budget);
    let timer = 0;
    let cancelled = false;
    const job = { img, cancel() {
      cancelled = true; clearTimeout(timer);
      img.removeEventListener('error', error); img.removeEventListener('load', success);
      jobs.delete(job);
    } };
    const success = () => {
      if (cancelled) return;
      clearTimeout(timer); timer = 0;
      budget.success = img.src;
      img.hidden = false;
      onSuccess();
    };
    const error = () => {
      if (cancelled || timer) return;
      if (budget.retries >= 2) {
        budget.failed = true; img.hidden = true; onFailure(); job.cancel(); return;
      }
      budget.retries++;
      timer = setTimeout(() => {
        timer = 0;
        if (!img.isConnected) { job.cancel(); return; }
        img.hidden = false;
        // Prefer the native original URL after a generated thumbnail rendition fails.
        img.src = urls.at(-1);
      }, 350 * budget.retries);
    };
    if (!urls.length || budget.failed) { img.hidden = true; onFailure(); return; }
    jobs.add(job);
    img.addEventListener('error', error);
    img.addEventListener('load', success);
    img.src = budget.success || urls[0];
  }
  return {
    load, prune,
    clear() { for (const job of jobs) job.cancel(); budgets.clear(); },
  };
}
