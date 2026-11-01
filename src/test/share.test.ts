import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { DEMO_SLUGS } from '../data/seed';
import { buttonSnippet, downloadName, escapeHtml, iframeSnippet, isShareableUrl, linkReach, qrPixels, qrSvg, shareMessage, whatsappShareUrl } from '../lib/share';

const decode = (url: string) => {
  const { data, width, height } = qrPixels(url, 6);
  return jsQR(data, width, height)?.data;
};

describe('QR codes', () => {
  it('decode back to the exact workflow URL', () => {
    for (const url of [
      'https://lielbs.github.io/formzelo-demo/f/bloom-flowers',
      'https://lielbs.github.io/formzelo-demo/f/autocare-repairs?r=run_0123456789abcdef',
      'http://localhost:5173/f/urban-table-booking',
      'https://formangle.example/f/valley-run',
    ]) {
      expect(decode(url)).toBe(url);
    }
  });

  it('builds a standalone SVG with a quiet zone and only safe colours', () => {
    const svg = qrSvg('https://lielbs.github.io/formzelo-demo/f/bloom-flowers', { dark: '#123456', light: 'red;"><script>' });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('fill="#123456"');
    expect(svg).not.toContain('<script');
    expect(svg).toMatch(/viewBox="0 0 (\d+) \1"/);
  });

  it('refuses anything that is not an http(s) URL', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'not a url', 'https://x.test/a"b']) {
      expect(isShareableUrl(bad)).toBe(false);
      expect(() => qrSvg(bad)).toThrow();
    }
  });
});

describe('sharing links and snippets', () => {
  it('prepares a WhatsApp share link with the encoded message', () => {
    const msg = shareMessage('בלום פרחים', 'הזמנת זר', 'https://lielbs.github.io/formzelo-demo/f/bloom-flowers');
    const href = whatsappShareUrl(msg);
    expect(href.startsWith('https://wa.me/?text=')).toBe(true);
    expect(new URL(href).searchParams.get('text')).toBe(msg);
  });

  it('escapes labels and titles inside website snippets', () => {
    const url = 'https://lielbs.github.io/formzelo-demo/f/bloom-flowers';
    const btn = buttonSnippet(url, '<b>"הזמינו"</b>', 'javascript:x');
    expect(btn).toContain(`href="${url}"`);
    expect(btn).toContain('&lt;b&gt;&quot;הזמינו&quot;&lt;/b&gt;');
    expect(btn).toContain('background:#E96B3D');
    const frame = iframeSnippet(url, `ז'ר "חדש"`);
    expect(frame).toContain('title="ז&#39;ר &quot;חדש&quot;"');
    expect(() => iframeSnippet('javascript:alert(1)', 'x')).toThrow();
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('tells demo links that open everywhere apart from local-only ones', () => {
    const seeded = Object.values(DEMO_SLUGS);
    expect(linkReach({ isDemo: true, slug: 'bloom-flowers' }, 1, seeded)).toBe('everywhere');
    expect(linkReach({ isDemo: true, slug: 'bloom-flowers' }, 3, seeded)).toBe('original_elsewhere');
    // A demo draft published in this browser does not exist anywhere else.
    expect(linkReach({ isDemo: true, slug: 'bloom-workshop' }, 1, seeded)).toBe('this_browser');
    expect(linkReach({ isDemo: false, slug: 'bloom-flowers' }, 1, seeded)).toBe('this_browser');
    expect(downloadName('bloom-flowers')).toBe('formangle-bloom-flowers');
    expect(downloadName('../../x')).toBe('formangle-x');
  });
});
