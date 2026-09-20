/**
 * {% pdf %} 占位卡片的客户端逻辑（标签实现见 scripts/pdf.js）。
 *
 * 两条路径，都只在用户点击后才开始下载 PDF：
 *
 *   有原生 PDF 阅读器（桌面浏览器）
 *     直接挂 <iframe>，交给浏览器自带的阅读器 —— 零额外 JS，
 *     还白得缩放、搜索、翻页、打印、下载。
 *
 *   没有原生 PDF 阅读器（navigator.pdfViewerEnabled === false，多数移动浏览器）
 *     给出醒目的「在新标签打开」入口，由系统 PDF 阅读器全屏接管。
 *
 * 关于为什么不上 PDF.js：v6 自托管一套要 5.5 MB（主体 459 KB + worker
 * 1.26 MB + cMaps 1.4 MB + 标准字体 820 KB + wasm 1.6 MB），而受益的只有
 * 4 个页面的移动端访问；且手机上把 PDF 挤在页内 canvas 里读，体验本就不如
 * 交给系统阅读器全屏打开。如果确实需要页内渲染，可以再把它加回来。
 *
 * 4 处调用里有 2 篇是加密文章，卡片藏在密文中、解密后才进入 DOM，
 * 所以除 DOMContentLoaded 外还要监听 hexo-blog-decrypt。
 */
(function () {
  function nativeViewerAvailable() {
    // pdfViewerEnabled 是标准 API；老浏览器读不到时按「可用」处理，
    // 反正 iframe 里还有浏览器自己的兜底行为，卡片上也一直留着打开链接。
    return typeof navigator.pdfViewerEnabled === 'boolean' ? navigator.pdfViewerEnabled : true;
  }

  function mountIframe(box, src) {
    var f = document.createElement('iframe');
    f.className = 'pdf-embed-frame';
    f.src = src + '#view=FitH';
    f.title = 'PDF';
    box.innerHTML = '';
    box.appendChild(f);
  }

  function mountOpenPrompt(box, src, label) {
    box.innerHTML =
      '<div class="pdf-embed-card">' +
      '<p class="pdf-embed-hint">当前浏览器没有内置 PDF 阅读器，点击下方按钮用系统阅读器打开。</p>' +
      '<a class="pdf-embed-load" href="' +
      src +
      '" target="_blank" rel="noopener">打开 ' +
      label +
      '</a>' +
      '</div>';
  }

  function bind(root) {
    var boxes = (root || document).querySelectorAll('.pdf-embed:not([data-pdf-bound])');
    Array.prototype.forEach.call(boxes, function (box) {
      box.setAttribute('data-pdf-bound', '1');
      var btn = box.querySelector('.pdf-embed-load');
      if (!btn) return;
      var label = btn.textContent.replace(/^载入 PDF · /, '');
      btn.addEventListener('click', function () {
        var src = box.getAttribute('data-pdf-src');
        if (!src) return;
        if (nativeViewerAvailable()) mountIframe(box, src);
        else mountOpenPrompt(box, src, label);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      bind();
    });
  } else {
    bind();
  }

  // 加密文章解密后卡片才进入 DOM
  window.addEventListener('hexo-blog-decrypt', function () {
    bind();
  });
  document.addEventListener('hexo-blog-decrypt', function () {
    bind();
  });
})();
