/**
 * 基于 Pagefind 的站内搜索。
 *
 * 本文件与主题的 source/js/search/local-search.js 输出到同一路径，
 * Hexo 中站点 source 优先于主题 source，因此会覆盖主题实现 —— 无需 fork。
 *
 * 为什么换掉原实现：主题原本用 hexo-generator-search 产出的 /search.xml，
 * 里面存的是渲染后的 HTML（含 KaTeX 与 Prism 标记，一个公式 "11" 就要
 * 500 字节），整份 11.5 MB，且要一次性全量下载才能搜第一个词。
 *
 * 现在：Pagefind 在构建后把索引切成分片，按需取用；并且整个 Pagefind
 * 运行时都是在用户首次打开搜索弹窗时才 import()，平时一个字节都不加载。
 *
 * 复用主题既有的 DOM 契约（见 layout/_widget/search/index.pug 与
 * source/css/_widget/search/local-search.styl）：
 *   输入框   #local-search-input.search-input
 *   结果容器 .search-result-container，无结果时加 .no-result
 *   结果结构 .search-stats + <hr> + ul.search-result-list > li
 *            > a > .search-result-title, p.search-result > em.search-keyword
 */

const MAX_RESULTS = 20;
const DEBOUNCE_MS = 200;

const input = document.querySelector('#local-search-input');
const container = document.querySelector('.search-result-container');

if (input && container) {
  const root = (window.CONFIG && window.CONFIG.root) || '/';
  const i18n = (window.CONFIG && window.CONFIG.i18n) || {};

  /** @type {Promise<any>|null} 首次需要时才发起，之后复用 */
  let loading = null;

  function loadPagefind() {
    if (!loading) {
      loading = import(`${root}pagefind/pagefind.js`.replace(/\/{2,}/g, '/'))
        .then(async (pf) => {
          await pf.options({ excerptLength: 30 });
          await pf.init();
          return pf;
        })
        .catch((err) => {
          // 让下次打开还能重试，而不是永久卡在失败的 Promise 上
          loading = null;
          throw err;
        });
    }
    return loading;
  }

  const escapeHtml = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /**
   * Pagefind 的 excerpt 用 <mark> 包裹命中词。先整体转义防止正文里的
   * HTML 被执行，再把转义后的 mark 标记换成主题的高亮元素。
   */
  const renderExcerpt = (excerpt) =>
    escapeHtml(excerpt)
      .replace(/&lt;mark&gt;/g, '<em class="search-keyword">')
      .replace(/&lt;\/mark&gt;/g, '</em>');

  function setMessage(html) {
    container.classList.add('no-result');
    container.innerHTML = html;
  }

  function renderResults(items, ms) {
    if (!items.length) {
      setMessage('<div class="search-stats">没有找到相关内容</div>');
      return;
    }
    const tpl = i18n.hits_time || '找到 ${hits} 条结果（用时 ${time} 毫秒）';
    const stats = tpl.replace('${hits}', items.length).replace('${time}', ms);
    const list = items
      .map(
        (it) => `<li>
          <a href="${escapeHtml(it.url)}"><span class="search-result-title">${escapeHtml(
            (it.meta && it.meta.title) || it.url
          )}</span></a>
          <p class="search-result">${renderExcerpt(it.excerpt)}</p>
        </li>`
      )
      .join('');
    container.classList.remove('no-result');
    container.innerHTML = `<div class="search-stats">${escapeHtml(stats)}</div><hr><ul class="search-result-list">${list}</ul>`;
  }

  let seq = 0;
  async function doSearch() {
    const term = input.value.trim();
    const mine = ++seq;

    if (!term) {
      setMessage('');
      return;
    }

    let pf;
    try {
      pf = await loadPagefind();
    } catch {
      setMessage('<div class="search-stats">搜索索引加载失败，请刷新重试</div>');
      return;
    }
    if (mine !== seq) return; // 加载期间用户又敲了新的词

    const t0 = performance.now();
    const search = await pf.debouncedSearch(term, {}, DEBOUNCE_MS);
    if (search === null || mine !== seq) return; // 被更新的一次查询取代

    const items = await Promise.all(search.results.slice(0, MAX_RESULTS).map((r) => r.data()));
    if (mine !== seq) return;

    renderResults(items, Math.round(performance.now() - t0));
  }

  input.addEventListener('input', doSearch);
  input.addEventListener('compositionend', doSearch); // 中文输入法：候选词上屏后再搜

  // 打开弹窗即预热，等用户敲完第一个字时运行时通常已就位
  document.querySelectorAll('.popup-trigger').forEach((el) =>
    el.addEventListener('click', () => {
      loadPagefind().catch(() => {});
    })
  );
}
