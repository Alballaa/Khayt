'use strict';
/**
 * A product's pictures — more than one, and each of them says what it IS.
 *
 * The catalog stored exactly two fields: `imagePath` (one file on disk) and
 * `thumbnail` (one data URI for the grid). The picker had no `multiple`, and
 * saving a new picture deleted the old one. So a shop selling a printed part had
 * one slot to hold a render, a photo of the real thing, a scale shot and a
 * detail of the finish — and had to choose.
 *
 * WHY THE LABEL MATTERS MORE THAN THE COUNT. A customer looking at a listing is
 * asking one question the pictures rarely answer: is that a render, or is that
 * what arrives? Guessing wrong is a refund. The print library already draws this
 * distinction for its own files — `thumb` for the slicer's preview and
 * `userPhoto` for a photo of the printed part — so the idea existed in the app
 * and had simply never reached products.
 *
 * ── The shape ───────────────────────────────────────────────────────────────
 *   images: [{ id, path, thumbnail, kind, caption }]
 *
 * `kind` is one of KINDS below. The FIRST image is the primary one: it is what
 * the grid, the storefront and the invoice use, so ordering is a decision the
 * shop makes rather than an accident of upload order.
 *
 * `imagePath` and `thumbnail` are still written, mirroring the primary. Every
 * other part of the app reads them — the storefront catalog, the published
 * portal, label printing — and a migration that renamed the field everywhere at
 * once would be a much larger and much riskier change than this one. They are a
 * VIEW of images[0], kept in step by normalise(), not a second source of truth.
 *
 * Pure: no DOM, no fs, no Electron.
 */
(function (global) {

  /**
   * What a picture is. Ordered as a shop would shoot them.
   *
   * `print` is the one that earns this whole file: a photograph of the actual
   * printed part. It is deliberately the second entry rather than the first,
   * because a render is usually what exists first and the honest label is worth
   * more than a flattering default.
   */
  const KINDS = [
    { key: 'render', label: 'Render', hint: 'A CAD or slicer render — not a photo of a real part.' },
    { key: 'print', label: 'Actual print', hint: 'A photograph of the printed part itself.' },
    { key: 'detail', label: 'Detail', hint: 'A close-up: finish, texture, a join, a moving part.' },
    { key: 'scale', label: 'Scale', hint: 'The part next to something recognisable, so size reads.' },
    { key: 'packaging', label: 'Packaging', hint: 'How it arrives.' },
  ];

  const KIND_KEYS = KINDS.map((k) => k.key);
  const DEFAULT_KIND = 'render';

  /** A stable-enough id for an image that has none. */
  function imageId(seed, index) {
    return `PIMG-${String(seed || 'x').replace(/[^A-Za-z0-9]/g, '').slice(0, 10)}-${index}`;
  }

  /**
   * Bring a product's pictures into the array shape, whatever it arrived in.
   *
   * Handles three states, because all three exist in real stores: a product
   * saved before this feature (imagePath + thumbnail), a product saved after it
   * (images[]), and a product with both because it was edited by an older build
   * after being saved by a newer one. The array wins where both are present and
   * disagree — it is the richer record — EXCEPT when it is empty, which is what
   * an older build writes when it drops a picture.
   */
  function normalise(product) {
    const p = product || {};
    let images = Array.isArray(p.images) ? p.images.filter(Boolean) : [];

    images = images.map((img, i) => ({
      id: img.id || imageId(p.id, i),
      path: img.path || '',
      thumbnail: img.thumbnail || '',
      kind: KIND_KEYS.includes(img.kind) ? img.kind : DEFAULT_KIND,
      caption: typeof img.caption === 'string' ? img.caption : '',
    })).filter((img) => img.path || img.thumbnail);

    // Nothing in the array but something in the legacy fields: this product has
    // not been migrated yet, or an older build just overwrote it.
    if (!images.length && (p.imagePath || p.thumbnail)) {
      images = [{
        id: imageId(p.id, 0),
        path: p.imagePath || '',
        thumbnail: p.thumbnail || '',
        // An image from before the split is UNLABELLED, not a render. Claiming
        // it shows a real printed part would be inventing a fact about a photo
        // nobody described; claiming it is a render would be too, and that one
        // at least cannot mislead a customer into expecting a photo.
        kind: DEFAULT_KIND,
        caption: '',
      }];
    }

    return {
      images,
      // The legacy view, kept in step. Empty when there are no pictures at all.
      imagePath: images[0] ? images[0].path : '',
      thumbnail: images[0] ? images[0].thumbnail : '',
    };
  }

  /**
   * Apply normalise() to a product object in place, returning it.
   *
   * Use this on LOAD, where the migration branch inside normalise() is the
   * point. Do not use it after a mutation — see syncView().
   */
  function apply(product) {
    if (!product) return product;
    const n = normalise(product);
    product.images = n.images;
    product.imagePath = n.imagePath;
    product.thumbnail = n.thumbnail;
    return product;
  }

  /**
   * Write the legacy view from the array, WITHOUT the migration branch.
   *
   * normalise() treats "empty array but imagePath set" as an unmigrated product
   * and rebuilds the array from the legacy field. That is right on load and
   * catastrophic after a delete: removing the last picture emptied images[],
   * left imagePath pointing at the file just unlinked, and the next normalise()
   * RESURRECTED the deleted image from it. Caught by the delete test, which is
   * the only place the two meanings of "empty" collide.
   */
  function syncView(product) {
    const imgs = Array.isArray(product.images) ? product.images : [];
    product.imagePath = imgs[0] ? imgs[0].path : '';
    product.thumbnail = imgs[0] ? imgs[0].thumbnail : '';
    return product;
  }

  /** Move an image to the front — the primary, used by the grid and storefront. */
  function makePrimary(product, id) {
    const p = apply(product);
    const i = p.images.findIndex((img) => img.id === id);
    if (i > 0) p.images.unshift(p.images.splice(i, 1)[0]);
    return syncView(p);
  }

  /** Remove one image. Returns the removed record so the caller can unlink the file. */
  function remove(product, id) {
    const p = apply(product);
    const i = p.images.findIndex((img) => img.id === id);
    if (i === -1) return null;
    const [gone] = p.images.splice(i, 1);
    syncView(p);
    return gone;
  }

  /** Set what a picture is. Unknown kinds are refused rather than stored. */
  function setKind(product, id, kind) {
    if (!KIND_KEYS.includes(kind)) return false;
    const p = apply(product);
    const img = p.images.find((x) => x.id === id);
    if (!img) return false;
    img.kind = kind;
    return true;
  }

  /**
   * Does this listing show the real thing?
   *
   * The question a customer is actually asking, and the one a shop should be
   * able to answer at a glance across its whole catalog.
   */
  function hasRealPhoto(product) {
    return normalise(product).images.some((img) => img.kind === 'print' || img.kind === 'detail');
  }

  const api = { KINDS, KIND_KEYS, DEFAULT_KIND, normalise, apply, syncView, makePrimary, remove, setKind, hasRealPhoto, imageId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.KhaytProductImages = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
