import { db } from '../storage/db';
import { button, toast } from './dom';
import { appendIconLabel } from './icons';

export function createQuizBookmarkButton(questionId: string, isCurrentRender: () => boolean): HTMLButtonElement {
  const bookmark = button('', 'btn ghost bookmark-btn');
  let bookmarked = false;
  const renderBookmark = () => {
    const label = bookmarked ? 'ブックマーク済み' : 'ブックマーク';
    appendIconLabel(bookmark, 'bookmark', label);
    bookmark.setAttribute('aria-label', label);
    bookmark.classList.toggle('selected', bookmarked);
  };
  renderBookmark();
  bookmark.disabled = true;
  void db
    .hasBookmark(questionId)
    .then((enabled) => {
      if (!isCurrentRender()) return;
      bookmarked = enabled;
      renderBookmark();
      bookmark.disabled = false;
    })
    .catch(() => {
      if (isCurrentRender()) toast('ブックマークを読み込めませんでした。');
    });
  bookmark.onclick = async () => {
    if (!isCurrentRender() || bookmark.disabled) return;
    const previous = bookmarked;
    bookmarked = !bookmarked;
    renderBookmark();
    bookmark.disabled = true;
    try {
      await db.setBookmark(questionId, bookmarked);
    } catch {
      if (!isCurrentRender()) return;
      bookmarked = previous;
      renderBookmark();
      toast('ブックマークを保存できませんでした。');
    } finally {
      if (isCurrentRender()) bookmark.disabled = false;
    }
  };

  return bookmark;
}
