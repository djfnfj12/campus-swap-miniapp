/* ===========================================================
 * 首页 & 搜索
 * =========================================================== */
'use strict';

const SORTS = [
  { key: 'new', label: '综合排序' },
  { key: 'hot', label: '人气最高' },
  { key: 'price_asc', label: '价格从低到高' },
  { key: 'price_desc', label: '价格从高到低' },
];

const HomeState = {
  sort: 'new', category: '', keyword: '', page: 1,
  list: [], hasMore: false, loading: false, timer: null,
};

/** 列表加载（首页 / 搜索共用） */
async function loadFeed(target, state, query) {
  if (state.loading || !state.hasMore && state.page > 1) return;
  state.loading = true;
  const loadMore = state.page > 1;
  const box = document.getElementById(target);
  if (box && !loadMore) box.innerHTML = UI.gridSkeleton();
  if (box && loadMore) box.insertAdjacentHTML('beforeend', '<div class="loading-bar" id="feedMore">加载中…</div>');

  try {
    const qs = new URLSearchParams({
      page: String(state.page), pageSize: '10', sort: state.sort, ...(query || {}),
    });
    if (state.category) qs.set('category', state.category);
    if (state.keyword) qs.set('keyword', state.keyword);
    const data = await API.get(`/items?${qs}`);
    state.list = loadMore ? state.list.concat(data.list) : data.list;
    state.hasMore = data.hasMore;
    state.page += 1;

    const el = document.getElementById(target);
    if (!el) return;
    if (!state.list.length) {
      el.innerHTML = UI.empty('🔍', '没有找到相关商品，换个关键词试试',
        '<button class="btn soft" data-go="#/publish">去发布一件闲置</button>');
      return;
    }
    el.innerHTML = `<div class="grid">${state.list.map(UI.card).join('')}</div>`
      + (state.hasMore ? '<div class="list-end">上拉加载更多</div>' : '<div class="list-end">— 已经到底啦 —</div>');
  } catch (err) {
    UI.toast(err.message);
  } finally {
    state.loading = false;
    const more = document.getElementById('feedMore');
    if (more) more.remove();
  }
}

App.route('home', {
  title: '校园闲置',
  tab: true,
  activeTab: 'home',
  async render(view) {
    if (HomeState.timer) clearInterval(HomeState.timer);
    HomeState.page = 1;
    HomeState.list = [];
    HomeState.keyword = '';

    view.innerHTML = `
      <div class="search-wrap">
        <div class="search-box" data-go="#/search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <span>搜索你想要的闲置好物</span>
        </div>
      </div>

      <div class="banner">
        <div class="banner-track" id="bannerTrack">
          <img src="/img/banner-1.svg" alt="新生季">
          <img src="/img/banner-2.svg" alt="考研专区">
          <img src="/img/banner-3.svg" alt="当面交易">
        </div>
        <div class="banner-dots" id="bannerDots"><i class="on"></i><i></i><i></i></div>
      </div>

      <div class="quick-cats" id="quickCats"></div>

      <div class="section-title">为你推荐
        <span class="more" id="sortBtn">综合排序 ▾</span>
      </div>
      <div class="grid" id="feed"></div>
      <div style="height:8px"></div>`;

    // 轮播
    let idx = 0;
    const track = view.querySelector('#bannerTrack');
    const dots = view.querySelectorAll('#bannerDots i');
    HomeState.timer = setInterval(() => {
      idx = (idx + 1) % 3;
      track.style.transform = `translateX(-${idx * 100}%)`;
      dots.forEach((d, i) => d.classList.toggle('on', i === idx));
    }, 3500);

    // 快捷分类
    try {
      const { categories } = await API.get('/categories');
      const icons = ['📱', '📚', '🧺', '👗', '🏸', '💄', '🎮', '📦'];
      const box = view.querySelector('#quickCats');
      if (box) {
        box.innerHTML = categories.map((c, i) => `
          <div class="quick-cat" data-go="#/category?c=${encodeURIComponent(c.name)}">
            <span class="ic">${icons[i] || '📦'}</span><span>${UI.esc(c.name)}</span>
          </div>`).join('');
      }
    } catch (err) { UI.toast(err.message); }

    // 排序
    view.querySelector('#sortBtn').onclick = async () => {
      const pick = await UI.sheet({
        title: '排序方式',
        items: SORTS.map((s) => ({ label: (stateSort() === s.key ? '✓ ' : '') + s.label, key: s.key })),
      });
      if (!pick) return;
      HomeState.sort = pick.key;
      HomeState.page = 1;
      view.querySelector('#sortBtn').textContent = `${SORTS.find((s) => s.key === pick.key).label} ▾`;
      loadFeed('feed', HomeState, {});
    };
    function stateSort() { return HomeState.sort; }

    loadFeed('feed', HomeState, {});
  },
  onScroll(e) {
    const el = e.target;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 260) {
      if (HomeState.hasMore && !HomeState.loading) loadFeed('feed', HomeState, {});
    }
  },
});

/* ---------------- 搜索页 ---------------- */
const SearchState = { sort: 'new', keyword: '', page: 1, list: [], hasMore: false, loading: false };

App.route('search', {
  title: '搜索',
  async render(view, params) {
    SearchState.keyword = params.query.kw || '';
    SearchState.page = 1;
    SearchState.list = [];

    view.innerHTML = `
      <div class="search-wrap">
        <div class="search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
          <input id="kw" placeholder="搜索商品 / 描述 / 分类" value="${UI.esc(SearchState.keyword)}">
          <button id="doSearch" class="tag" style="padding:5px 10px">搜索</button>
        </div>
      </div>
      <div class="section-title" style="margin-top:6px">热门搜索
        <span class="more" id="clearHist">清空</span>
      </div>
      <div class="module-grid" style="padding:0 12px" id="hotWords">
        ${['高数教材', '耳机', '笔记本', '台灯', '跑鞋', '考研', '尤克里里', '手机'].map((w) => `<span data-kw="${w}">${w}</span>`).join('')}
      </div>
      <div class="section-title">搜索结果 <span class="more" id="sortBtn2"></span></div>
      <div id="feed"></div>`;

    const input = view.querySelector('#kw');
    const run = () => {
      SearchState.keyword = input.value.trim();
      SearchState.page = 1;
      SearchState.list = [];
      loadFeed('feed', SearchState, {});
    };
    view.querySelector('#doSearch').onclick = run;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
    view.querySelectorAll('[data-kw]').forEach((el) => {
      el.onclick = () => { input.value = el.dataset.kw; run(); };
    });
    view.querySelector('#clearHist').onclick = () => {
      view.querySelectorAll('[data-kw]').forEach((el) => el.remove());
      UI.toast('已清空热门词');
    };
    view.querySelector('#sortBtn2').textContent = SORTS[0].label + ' ▾';
    view.querySelector('#sortBtn2').onclick = async () => {
      const pick = await UI.sheet({ title: '排序方式', items: SORTS.map((s) => ({ label: s.label, key: s.key })) });
      if (!pick) return;
      SearchState.sort = pick.key;
      view.querySelector('#sortBtn2').textContent = pick.label + ' ▾';
      SearchState.page = 1;
      loadFeed('feed', SearchState, {});
    };

    if (SearchState.keyword) run();
    else view.querySelector('#feed').innerHTML = UI.empty('✨', '输入关键词，或点击上方热门词开始搜索');
    setTimeout(() => input.focus(), 120);
  },
  onScroll(e) {
    const el = e.target;
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 260) {
      if (SearchState.hasMore && !SearchState.loading) loadFeed('feed', SearchState, {});
    }
  },
});
