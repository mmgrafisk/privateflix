# PrivateFlix Chrome extension · v0.4.2

PrivateFlix is a local-first organizer for adult AI characters, prompts, images, videos and useful links. The extension stores the private library in `chrome.storage.local`; it does not send library entries or browsing history to the PrivateFlix website.

When a page is saved, PrivateFlix automatically looks for its poster image, direct video preview, duration and resolution. Available previews play muted when a library card is hovered or focused. Publishers that hide or block a media field are shown as unknown instead of being guessed.

## Load it in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked**.
4. Select this `privateflix-extension` folder.

Use the toolbar popup to save the current page. PrivateFlix automatically detects available poster URLs, preview media, duration, quality and performers. Poster images load directly from the source website and are not downloaded into PrivateFlix. Open **My Library** for search, website and performer filters, sorting and editing. AI Discover remains directly accessible, while the burger menu contains How-to guides, Settings and Privacy & data.

After importing a JSON backup, open **Settings** and choose **Refresh all media**. With your approval, PrivateFlix first reads the saved page metadata without executing the page and uses a background tab only when a source needs a live-page fallback. It refreshes poster URLs, preview URLs, duration, quality, performers and source logos. Images remain on their publishers' servers, nothing is uploaded, and the result reports posters, previews, details and unavailable pages separately.

## Keyboard shortcuts

- `Ctrl/Command + Shift + S`: open PrivateFlix for the current page.
- `Ctrl/Command + Shift + L`: open the library.
- `Ctrl/Command + Shift + X`: toggle the neutral Privacy Shield workspace.

## Privacy model

- Saved pages, notes, tags and preferences remain in the browser.
- No passive history scanning or network-traffic collection.
- The extension requests and inspects the current tab only after a direct user action.
- PrivateFlix does not request browsing-history, browsing-data or network-blocking permissions.
- Discover fetches the public version-2 catalogue from the PrivateFlix website.

## Development

Run `npm test` and `npm run validate`. The package contains no runtime dependencies or build step.
