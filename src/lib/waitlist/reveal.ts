export function scrollReveal(node: HTMLElement, onProgress: (p: number) => void) {
  let ticking = false;
  function compute() {
    const rect = node.getBoundingClientRect();
    const vh = window.innerHeight;
    const start = vh * 0.65;
    const end = vh * 0.05;
    onProgress(Math.min(1, Math.max(0, (start - rect.top) / (start - end))));
    ticking = false;
  }
  function onScroll() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(compute);
    }
  }
  compute();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  return {
    destroy() {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    }
  };
}

export function stagger(progress: number, index: number, count: number): number {
  return Math.min(1, Math.max(0, progress * count - index));
}

export function revealAfter(progress: number, threshold: number): number {
  return Math.min(1, Math.max(0, (progress - threshold) / (1 - threshold)));
}

export function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}
