/**
 * Measures taken from the page itself, so a review can fail a page on numbers instead of taste.
 * The script runs in the capture window after the page settled, at each viewport, and returns
 * the shape of `PreviewMeasuresSchema`: bands of the page with nothing drawn, every heading with
 * its size, the same call to action repeated within one screen, content wider than the viewport,
 * text clipped or overlapping, images without alternative text and text with too little
 * contrast. Everything is bounded; a page it cannot walk entirely reports `partial`.
 */
export const PREVIEW_MEASURES_SCRIPT = `(() => {
  const MAX_NODES = 15000
  const MAX_TEXT_BLOCKS = 400
  const vw = innerWidth
  const vh = innerHeight
  const docEl = document.documentElement
  const docWidth = Math.max(docEl.scrollWidth, document.body ? document.body.scrollWidth : 0)
  const docHeight = Math.max(docEl.scrollHeight, document.body ? document.body.scrollHeight : 0)
  const scrollTop0 = scrollY
  const scrollLeft0 = scrollX
  let coverage = 'complete'

  const clip = (text, length) => String(text || '').replace(/\\s+/g, ' ').trim().slice(0, length)
  const selectorFor = (element) => {
    const parts = []
    for (let current = element; current && current.nodeType === 1 && parts.length < 4; current = current.parentElement) {
      let part = current.localName
      if (current.id) { parts.unshift(part + '#' + CSS.escape(current.id)); break }
      const classes = Array.from(current.classList || []).slice(0, 2)
      if (classes.length) part += '.' + classes.map((name) => CSS.escape(name)).join('.')
      parts.unshift(part)
    }
    return parts.join(' > ').slice(0, 300)
  }
  const isRendered = (element) => {
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false
    if (typeof element.checkVisibility === 'function'
      && !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false
    return true
  }
  const fixedCache = new Map()
  const isFixedOrSticky = (element) => {
    if (!element || element.nodeType !== 1) return false
    if (fixedCache.has(element)) return fixedCache.get(element)
    const position = getComputedStyle(element).position
    const result = position === 'fixed' || position === 'sticky' || isFixedOrSticky(element.parentElement)
    fixedCache.set(element, result)
    return result
  }
  const documentRect = (rect) => ({
    left: rect.left + scrollX, right: rect.right + scrollX,
    top: rect.top + scrollY, bottom: rect.bottom + scrollY,
    width: rect.width, height: rect.height,
  })

  // One walk of the light DOM: elements, in document order, bounded.
  const elements = []
  const walker = document.createTreeWalker(document.body || docEl, NodeFilter.SHOW_ELEMENT)
  for (let node = walker.currentNode; node; node = walker.nextNode()) {
    if (elements.length >= MAX_NODES) { coverage = 'partial'; break }
    if (node.nodeType === 1) elements.push(node)
  }

  // Colours: any CSS colour syntax is read through a canvas, which always answers in sRGB.
  const swatch = document.createElement('canvas')
  swatch.width = swatch.height = 1
  const swatchContext = swatch.getContext('2d', { willReadFrequently: true })
  const colourCache = new Map()
  const toRgba = (value) => {
    if (colourCache.has(value)) return colourCache.get(value)
    let result = null
    if (swatchContext) {
      swatchContext.clearRect(0, 0, 1, 1)
      swatchContext.fillStyle = '#000'
      swatchContext.fillStyle = value
      swatchContext.fillRect(0, 0, 1, 1)
      const data = swatchContext.getImageData(0, 0, 1, 1).data
      const alpha = data[3] / 255
      // Canvas premultiplies; undo it so alpha and colour stay separate.
      result = alpha === 0 ? [0, 0, 0, 0]
        : [Math.round(data[0] / alpha), Math.round(data[1] / alpha), Math.round(data[2] / alpha), alpha]
    }
    colourCache.set(value, result)
    return result
  }
  const over = (top, bottom) => {
    const alpha = top[3]
    return [
      top[0] * alpha + bottom[0] * (1 - alpha),
      top[1] * alpha + bottom[1] * (1 - alpha),
      top[2] * alpha + bottom[2] * (1 - alpha),
      1,
    ]
  }
  const luminance = (rgb) => {
    const channel = (value) => {
      const unit = value / 255
      return unit <= 0.03928 ? unit / 12.92 : Math.pow((unit + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
  }
  // The colour behind an element: the nearest ancestors' backgrounds, blended. Unknown (null)
  // when an image or gradient sits behind the text, because a number would be a guess.
  const backdropOf = (element) => {
    const layers = []
    for (let current = element; current && current.nodeType === 1; current = current.parentElement) {
      const style = getComputedStyle(current)
      if (style.backgroundImage && style.backgroundImage !== 'none') return null
      const colour = toRgba(style.backgroundColor)
      if (colour && colour[3] > 0) {
        layers.push(colour)
        if (colour[3] >= 0.999) break
      }
    }
    let backdrop = [255, 255, 255, 1]
    for (let index = layers.length - 1; index >= 0; index -= 1) backdrop = over(layers[index], backdrop)
    return backdrop
  }

  // Text blocks: elements that directly hold visible text.
  const textBlocks = []
  const contentRects = []
  const headings = []
  const lowContrast = []
  let lowContrastCount = 0
  const clipped = []
  let bodyFontSize = 16
  if (document.body) bodyFontSize = parseFloat(getComputedStyle(document.body).fontSize) || 16

  for (const element of elements) {
    const tag = element.localName
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template') continue
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    const fixed = isFixedOrSticky(element)
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    const box = documentRect(rect)

    // Foreground content for the empty-band scan: media, controls, and a background photo.
    const media = tag === 'img' || tag === 'video' || tag === 'canvas' || tag === 'picture' || tag === 'iframe' || tag === 'svg'
    const control = tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button'
    const photo = style.backgroundImage && style.backgroundImage.indexOf('url(') !== -1
    if (!fixed && (media || control || photo) && isRendered(element)) {
      const area = box.width * box.height
      // A decorative speck (an icon, a divider) does not fill a band.
      if (area >= 2500 || tag === 'img' || tag === 'video' || photo) contentRects.push(box)
    }

    // Own text: a text node child with letters in it.
    let ownText = ''
    for (const child of element.childNodes) {
      if (child.nodeType === 3 && /\\S/.test(child.nodeValue)) ownText += child.nodeValue
    }
    if (!ownText || !isRendered(element)) continue
    const range = document.createRange()
    range.selectNodeContents(element)
    const lineRects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0)
    range.detach()
    if (!fixed) {
      for (const lineRect of lineRects) {
        const lineBox = documentRect(lineRect)
        if (lineBox.width * lineBox.height >= 2500 || lineBox.width >= 120) contentRects.push(lineBox)
      }
    }

    const fontSize = parseFloat(style.fontSize) || bodyFontSize
    const text = clip(element.textContent, 200)
    if (/^h[1-6]$/.test(tag) && headings.length < 40) {
      const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.2
      let footer = false
      for (let up = element.parentElement; up; up = up.parentElement) {
        if (up.localName === 'footer' || up.getAttribute('role') === 'contentinfo') { footer = true; break }
      }
      headings.push({
        selector: selectorFor(element),
        tag,
        text,
        fontSize: Math.round(fontSize * 10) / 10,
        lines: Math.max(1, Math.round(rect.height / lineHeight)),
        inFooter: footer,
        top: Math.round(box.top),
      })
    }

    if (textBlocks.length < MAX_TEXT_BLOCKS && !fixed) {
      textBlocks.push({ element, box, text })
    }

    // Contrast of the text against what is behind it.
    const colour = toRgba(style.color)
    if (colour && style.webkitTextFillColor !== 'transparent') {
      const backdrop = backdropOf(element)
      if (backdrop) {
        const foreground = colour[3] < 1 ? over(colour, backdrop) : colour
        const l1 = luminance(foreground)
        const l2 = luminance(backdrop)
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
        const weight = parseInt(style.fontWeight, 10) || 400
        const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700)
        const required = large ? 3 : 4.5
        // Text that is meant to be seen but fades in is judged after the settle, so opacity is final.
        const opacity = parseFloat(style.opacity)
        if (ratio < required && opacity > 0.5) {
          lowContrastCount += 1
          lowContrast.push({ selector: selectorFor(element), text: clip(ownText, 80), ratio: Math.round(ratio * 100) / 100, required })
        }
      }
    }

    // Text cut off by its own box.
    const overflowX = style.overflowX
    const overflowY = style.overflowY
    if ((overflowX === 'hidden' || overflowY === 'hidden' || overflowX === 'clip' || overflowY === 'clip')
      && style.textOverflow !== 'ellipsis') {
      if (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2) {
        if (clipped.length < 6) clipped.push({ selector: selectorFor(element), text })
      }
    }
  }

  // Bands with nothing drawn: sweep the content intervals down the page.
  const intervals = contentRects
    .map((box) => [Math.max(0, box.top), Math.min(docHeight, box.bottom)])
    .filter((pair) => pair[1] > pair[0])
    .sort((a, b) => a[0] - b[0])
  const minBand = Math.max(360, Math.round(vh * 0.45))
  const emptyRegions = []
  let cursor = 0
  const nearestText = (y, below) => {
    let best = null
    let bestDistance = Infinity
    for (const block of textBlocks) {
      const distance = below ? block.box.top - y : y - block.box.bottom
      if (distance >= -4 && distance < bestDistance) { bestDistance = distance; best = block }
    }
    return best ? clip(best.text, 60) : undefined
  }
  const closeBand = (from, to) => {
    if (to - from >= minBand && emptyRegions.length < 6) {
      const before = nearestText(from, false)
      const after = nearestText(to, true)
      emptyRegions.push({
        top: Math.round(from), height: Math.round(to - from),
        ...(before ? { before } : {}), ...(after ? { after } : {}),
      })
    }
  }
  for (const [start, end] of intervals) {
    if (start > cursor) closeBand(cursor, start)
    if (end > cursor) cursor = end
  }
  // The space under the last content of a page that is no taller than the window is only the
  // window filling up (an app screen), not an empty region of the design.
  if (docHeight > vh + 8) closeBand(cursor, docHeight)
  emptyRegions.sort((a, b) => b.height - a.height)

  // The same button-like call to action more than once within one viewport height.
  const ctaGroups = new Map()
  for (const element of elements) {
    const tag = element.localName
    // Links styled as buttons and submit buttons; a toggle or a tab is not a call to action.
    if (!(tag === 'a' && element.hasAttribute('href')) && !(tag === 'button' && element.type === 'submit')) continue
    if (element.closest('nav')) continue
    const label = clip(element.textContent, 60).toLowerCase()
    if (!label || label.length > 40) continue
    const style = getComputedStyle(element)
    const filled = toRgba(style.backgroundColor)
    const looksLikeButton = tag === 'button' || (filled && filled[3] > 0.2) || parseFloat(style.borderTopWidth) > 0
    if (!looksLikeButton || !isRendered(element)) continue
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    const top = Math.max(0, rect.top + scrollY)
    const list = ctaGroups.get(label) || []
    list.push(top)
    ctaGroups.set(label, list)
  }
  const duplicateCtas = []
  for (const [label, tops] of ctaGroups) {
    tops.sort((a, b) => a - b)
    let best = 0
    let bestTop = 0
    for (let index = 0; index < tops.length; index += 1) {
      let count = 0
      for (let next = index; next < tops.length && tops[next] - tops[index] < vh; next += 1) count += 1
      if (count > best) { best = count; bestTop = tops[index] }
    }
    if (best >= 2 && duplicateCtas.length < 6) duplicateCtas.push({ text: label, count: best, top: Math.round(bestTop) })
  }

  // Content wider than the viewport.
  let horizontalOverflow
  if (docWidth > vw + 1) {
    const offenders = []
    for (const element of elements) {
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0 || rect.right <= vw + 1) continue
      let hidden = false
      for (let up = element.parentElement; up && up !== document.body && up !== docEl; up = up.parentElement) {
        const style = getComputedStyle(up)
        if (style.overflowX !== 'visible') { hidden = true; break }
      }
      if (!hidden && isRendered(element) && !isFixedOrSticky(element)) offenders.push({ selector: selectorFor(element), right: Math.round(rect.right) })
      if (offenders.length >= 40) break
    }
    offenders.sort((a, b) => b.right - a.right)
    horizontalOverflow = { overflowBy: Math.round(docWidth - vw), elements: offenders.slice(0, 6) }
  }

  // Text that lies on top of other text: two blocks whose boxes cross, neither inside the other.
  const overlappingText = []
  for (let first = 0; first < textBlocks.length && overlappingText.length < 6; first += 1) {
    const a = textBlocks[first]
    for (let second = first + 1; second < textBlocks.length && overlappingText.length < 6; second += 1) {
      const b = textBlocks[second]
      if (b.box.top >= a.box.bottom || b.box.bottom <= a.box.top) continue
      if (a.element.contains(b.element) || b.element.contains(a.element)) continue
      const width = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left)
      const height = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top)
      if (width <= 0 || height <= 0) continue
      const smaller = Math.min(a.box.width * a.box.height, b.box.width * b.box.height)
      if (smaller <= 0 || (width * height) / smaller < 0.3) continue
      overlappingText.push({
        first: { selector: selectorFor(a.element), text: a.text },
        second: { selector: selectorFor(b.element), text: b.text },
      })
    }
  }

  // Images with no alternative text at all (an empty alt marks a decorative image on purpose).
  const missingAlt = []
  let missingAltCount = 0
  for (const image of Array.from(document.images)) {
    if (image.hasAttribute('alt') || image.getAttribute('role') === 'presentation' || image.getAttribute('aria-hidden') === 'true') continue
    const rect = image.getBoundingClientRect()
    if (rect.width < 8 || rect.height < 8 || !isRendered(image)) continue
    missingAltCount += 1
    if (missingAlt.length < 6) missingAlt.push(clip((image.currentSrc || image.src || '').split('/').pop(), 120) || selectorFor(image))
  }

  lowContrast.sort((a, b) => a.ratio / a.required - b.ratio / b.required)
  duplicateCtas.sort((a, b) => b.count - a.count)
  scrollTo({ left: scrollLeft0, top: scrollTop0, behavior: 'instant' })

  return {
    documentWidth: Math.round(docWidth),
    documentHeight: Math.round(docHeight),
    bodyFontSize: Math.round(bodyFontSize * 10) / 10,
    emptyRegions,
    headings,
    duplicateCtas,
    ...(horizontalOverflow ? { horizontalOverflow } : {}),
    clippedText: clipped,
    overlappingText,
    imagesMissingAlt: { count: missingAltCount, examples: missingAlt },
    lowContrast: { count: lowContrastCount, worst: lowContrast.slice(0, 6) },
    coverage,
  }
})()`
